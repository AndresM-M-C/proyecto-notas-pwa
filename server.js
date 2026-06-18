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
                rejectUnauthorized: false
            }
        });

        // Intentar verificar la conexión con Gmail sin detener el servidor si falla
        try {
            await emailTransporter.verify();
            console.log('Servidor de correos (Nodemailer) listo.');
        } catch (e) {
            console.log('Aviso: Gmail no se validó en el arranque, usando respaldo.');
        }

    } catch (error) {
        console.error('Error crítico al inicializar el servidor o crear tablas:', error.message);
    }
}

// ==========================================
// 1. RUTA: REGISTRO DE USUARIOS (ASÍNCRONO)
// ==========================================
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    try {
        if (!pool) throw new Error('La base de datos no está inicializada.');

        console.log(`Intentando registrar al usuario: ${email}`);

        // Guardar en la Base de Datos
        const [result] = await pool.query(
            'INSERT INTO usuarios (email, password) VALUES (?, ?)', 
            [email, password]
        );
        console.log(`Usuario ${email} guardado correctamente.`);

        // RESPUESTA INMEDIATA AL FRONTEND
        res.status(200).json({ success: true, message: 'Usuario registrado con éxito.' });

        // SEGUNDO PLANO: Envío del correo de verificación
        if (emailTransporter) {
            const mailOptions = {
                from: `"Proyecto Notas" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Verificación de Cuenta - Proyecto Notas',
                text: '¡Gracias por registrarte en nuestra aplicación de notas PWA! Tu cuenta se ha creado con éxito.'
            };

            emailTransporter.sendMail(mailOptions)
                .then(() => console.log(`[Correo] Verificación enviada a: ${email}`))
                .catch((err) => console.log(`[Correo] Error al enviar verificación: ${err.message}`));
        }

    } catch (dbError) {
        console.error('Fallo en la BD:', dbError.message);
        return res.status(500).json({ error: `Fallo en la Base de Datos: ${dbError.message}` });
    }
});

// ==========================================
// 2. NUEVA RUTA: INICIO DE SESIÓN (LOGIN)
// ==========================================
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    try {
        if (!pool) throw new Error('La base de datos no está inicializada.');

        // Buscar al usuario en la tabla correcta "usuarios"
        const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);

        if (rows.length === 0) {
            return res.status(401).json({ error: 'El correo electrónico no está registrado.' });
        }

        const user = rows[0];

        // Validación de contraseña (texto plano temporal para tu desarrollo)
        if (user.password !== password) {
            return res.status(401).json({ error: 'La contraseña es incorrecta.' });
        }

        console.log(`Usuario inició sesión con éxito: ${email}`);
        return res.status(200).json({ 
            success: true, 
            message: 'Inicio de sesión exitoso.',
            user: { id: user.id, email: user.email }
        });

    } catch (error) {
        console.error('Error en el login:', error.message);
        return res.status(500).json({ error: 'Error interno del servidor al iniciar sesión.' });
    }
});

// ==========================================
// 3. NUEVA RUTA: RECUPERAR CONTRASEÑA
// ==========================================
app.post('/api/recover', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'El correo es obligatorio.' });
    }

    try {
        if (!pool) throw new Error('La base de datos no está inicializada.');

        // Verificar si el correo existe
        const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'No existe ninguna cuenta con ese correo.' });
        }

        // RESPUESTA INMEDIATA
        res.status(200).json({ success: true, message: 'Si el correo existe, se enviará un enlace.' });

        // SEGUNDO PLANO: Enviar correo con la contraseña (o token)
        if (emailTransporter) {
            const mailOptions = {
                from: `"Proyecto Notas" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Recuperación de Contraseña - Proyecto Notas',
                text: `Hola. Has solicitado recuperar tu contraseña. Tu contraseña actual es: ${rows[0].password}`
            };

            emailTransporter.sendMail(mailOptions)
                .then(() => console.log(`[Correo] Recuperación enviada a: ${email}`))
                .catch((err) => console.log(`[Correo] Error al enviar recuperación: ${err.message}`));
        }

    } catch (error) {
        console.error('Error en la recuperación:', error.message);
        return res.status(500).json({ error: 'Error al procesar la solicitud de recuperación.' });
    }
});

// Ruta comodín para servir el index.html en cualquier otra navegación (Esencial para PWAs)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'Proyecto notas', 'index.html'));
});

// Escuchar en el puerto dinámico de Railway
const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
    await initServer();
});
