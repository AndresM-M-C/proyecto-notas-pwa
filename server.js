const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();

// Middlewares obligatorios para procesar JSON y datos de formularios
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir los archivos estáticos de tu interfaz de usuario (Frontend)
app.use(express.static(path.join(__dirname, 'Proyecto notas')));

let pool;
let emailTransporter;

// Función para inicializar las conexiones de forma segura al arrancar
async function initServer() {
    try {
        // 1. Configuración del Pool de conexiones a la Base de Datos (Clever Cloud)
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        // Probar la conexión inicial de la BD
        const connection = await pool.getConnection();
        console.log('Conexión con Clever Cloud establecida exitosamente.');
        
        // AUTOMÁTICO: Crear la tabla usuarios si no existe en Clever Cloud
        await connection.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Tabla "usuarios" verificada o creada exitosamente en la nube.');

        // Liberar la conexión de prueba al pool
        connection.release();

        // 2. CONFIGURACIÓN OPTIMIZADA: Puerto seguro 465 para evitar Connection Timeout en la nube
        emailTransporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true, // true para usar SSL en el puerto 465
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS // Tu contraseña de aplicación de 16 dígitos
            },
            tls: {
                rejectUnauthorized: false // Evita bloqueos por certificados en ciertos entornos
            }
        });

        // Verificar que Gmail acepte las credenciales al arrancar
        await emailTransporter.verify();
        console.log('Servidor de correos (Nodemailer) listo.');

        console.log('Servidor y base de datos inicializados con éxito.');

    } catch (error) {
        console.error('Error crítico al inicializar el servidor o crear tablas:', error.message);
    }
}

// ==========================================
// RUTA CRÍTICA: REGISTRO DE USUARIOS
// ==========================================
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;

    // Validación básica en el backend
    if (!email || !password) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    try {
        // Asegurar que el Pool esté listo antes de consultar
        if (!pool) {
            throw new Error('La base de datos no está inicializada. Verifica las variables de entorno.');
        }

        console.log(`Intentando registrar al usuario: ${email}`);

        // 1. Intentar insertar el usuario en la Base de Datos remota
        const [result] = await pool.query(
            'INSERT INTO usuarios (email, password) VALUES (?, ?)', 
            [email, password]
        );

        console.log(`Usuario ${email} guardado correctamente en la BD.`);

        // 2. Intentar enviar el correo de verificación de manera aislada
        try {
            if (!emailTransporter) {
                throw new Error('El transportador de correo electrónico no está configurado.');
            }

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Verificación de Cuenta - Proyecto Notas',
                text: '¡Gracias por registrarte en nuestra aplicación de notas PWA! Tu cuenta se ha creado con éxito.'
            };

            await emailTransporter.sendMail(mailOptions);
            console.log(`Correo de verificación enviado con éxito a: ${email}`);

            // Si todo sale perfecto
            return res.status(200).json({ 
                success: true, 
                message: 'Usuario registrado con éxito y correo de verificación enviado.' 
            });

        } catch (mailError) {
            console.error('Fallo controlado en Nodemailer:', mailError.message);
            
            // ATENCIÓN: El usuario SÍ se guardó en la BD, pero el correo falló.
            // Le avisamos al frontend el error exacto de Gmail sin romper el flujo.
            return res.status(500).json({ 
                error: `Usuario creado en la base de datos, pero falló el envío del correo: ${mailError.message}` 
            });
        }

    } catch (dbError) {
        console.error('Fallo controlado en la Base de Datos:', dbError.message);

        // Si el correo ya existe o hay problemas de estructura, Clever Cloud responderá un mensaje claro en texto
        return res.status(500).json({ 
            error: `Fallo en la Base de Datos de Clever Cloud: ${dbError.message}` 
        });
    }
});

// Ruta comodín para servir el index.html en cualquier otra navegación (Esencial para PWAs)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'Proyecto notas', 'index.html'));
});

// Escuchar en el puerto dinámico de Render o el 10000 por defecto
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
    await initServer(); // Iniciar bases de datos y tablas una vez levantado el puerto
});
