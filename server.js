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
        connection.release();

        // 2. Configuración del servicio de correos (Nodemailer con Gmail)
        emailTransporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true, // Usa SSL para el puerto 465
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS // Tu contraseña de aplicación de 16 dígitos
            },
            tls: {
                rejectUnauthorized: false // Evita bloqueos por certificados en entornos de nube
            }
        });

        // Intentar verificar la conexión con Gmail sin detener el servidor si falla
        try {
            await emailTransporter.verify();
            console.log('Servidor de correos (Nodemailer) listo.');
        } catch (e) {
            console.log('Aviso: Gmail no se validó en el arranque, se usará el respaldo en segundo plano.');
        }

    } catch (error) {
        console.error('Error crítico al inicializar el servidor o crear tablas:', error.message);
    }
}

// ==========================================
// RUTA CRÍTICA: REGISTRO DE USUARIOS (ASÍNCRONO)
// ==========================================
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;

    // Validación básica en el backend
    if (!email || !password) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    try {
        if (!pool) {
            throw new Error('La base de datos no está inicializada. Verifica las variables de entorno.');
        }

        console.log(`Intentando registrar al usuario: ${email}`);

        // 1. Guardar de inmediato al usuario en la Base de Datos de Clever Cloud
        const [result] = await pool.query(
            'INSERT INTO usuarios (email, password) VALUES (?, ?)', 
            [email, password]
        );
        console.log(`Usuario ${email} guardado correctamente en la BD.`);

        // 2. RESPUESTA INMEDIATA AL FRONTEND
        // Al enviar esto aquí, el botón "Enviando correo..." de tu web cambiará a éxito de inmediato
        res.status(200).json({ 
            success: true, 
            message: 'Usuario registrado con éxito.' 
        });

        // 3. SEGUNDO PLANO: El correo se procesa de forma independiente
        // Si el correo se retrasa o se cae, no afectará la experiencia del usuario en la pantalla
        if (emailTransporter) {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Verificación de Cuenta - Proyecto Notas',
                text: '¡Gracias por registrarte en nuestra aplicación de notas PWA! Tu cuenta se ha creado con éxito.'
            };

            emailTransporter.sendMail(mailOptions)
                .then(() => console.log(`[Segundo Plano] Correo de verificación enviado a: ${email}`))
                .catch((err) => console.log(`[Segundo Plano] Envío de correo omitido/fallido: ${err.message}`));
        }

    } catch (dbError) {
        console.error('Fallo controlado en la Base de Datos:', dbError.message);
        // Si el usuario ya existe, Clever Cloud frena el proceso y le avisamos al frontend
        return res.status(500).json({ 
            error: `Fallo en la Base de Datos de Clever Cloud: ${dbError.message}` 
        });
    }
});

// Ruta comodín para servir el index.html en cualquier otra navegación (Esencial para PWAs)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'Proyecto notas', 'index.html'));
});

// Escuchar en el puerto dinámico que asigne Railway (usa el 8080 o el process.env.PORT)
const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
    await initServer(); // Inicializar base de datos y tablas al levantar el puerto
});
