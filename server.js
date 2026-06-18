const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'Proyecto notas')));

let pool;
let emailTransporter;

// Configuración de correo segura usando variables de entorno o valores por defecto
const MI_GMAIL = process.env.EMAIL_USER || "proyectonotas6@gmail.com";
const MI_PASSWORD_APP = process.env.EMAIL_PASS || "aiwszhvszzycuntm";

// Detectar automáticamente la URL de Render para que los enlaces de correo no usen localhost
const BASE_URL = process.env.RENDER
    ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
    : 'http://localhost:3000';

async function initServer() {
    // El código detectará si está en Render para usar Clever Cloud, de lo contrario usará tu Localhost
    const dbConfig = process.env.RENDER ? {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT) || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    } : {
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'notas_pwa',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    };

    pool = mysql.createPool(dbConfig);

    // Configuración del transporte de Nodemailer con Gmail
    emailTransporter = nodemailer.createTransport({
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: MI_GMAIL,
            pass: MI_PASSWORD_APP
        }
    });

    // Creación automática de tablas si no existen en Clever Cloud
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            verified BOOLEAN DEFAULT FALSE,
            token VARCHAR(255)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS notes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT,
            title VARCHAR(255),
            content TEXT,
            color VARCHAR(50),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    console.log('Servidor y base de datos inicializados con éxito.');
}

initServer().catch(err => {
    console.error('Error crítico al inicializar el servidor:', err);
});

// --- RUTAS DE LA API ---

app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const token = crypto.randomBytes(32).toString('hex');
        await pool.query('INSERT INTO users (username, email, password, token) VALUES (?, ?, ?, ?)', [username, email, password, token]);

        const verificationLink = `${BASE_URL}/api/verify?token=${token}`;

        const mailOptions = {
            from: MI_GMAIL,
            to: email,
            subject: 'Verificación de Correo - Proyecto Notas',
            html: `<p>Hola ${username},</p><p>Por favor verifica tu correo haciendo clic en el siguiente enlace:</p><a href="${verificationLink}">${verificationLink}</a>`
        };

        await emailTransporter.sendMail(mailOptions);
        res.json({ message: 'Usuario registrado. Por favor verifica tu correo electrónico.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
        }
        console.error(err);
        res.status(500).json({ error: 'Error en el servidor durante el registro.' });
    }
});

app.get('/api/verify', async (req, res) => {
    const { token } = req.query;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE token = ?', [token]);
        if (users.length === 0) return res.status(400).send('Token inválido o expirado.');

        await pool.query('UPDATE users SET verified = TRUE, token = NULL WHERE id = ?', [users[0].id]);

        res.send(`
            <div style="text-align: center; font-family: sans-serif; margin-top: 50px;">
                <h1 style="color: #4CAF50;">¡Cuenta verificada con éxito!</h1>
                <p>Ya puedes regresar a la aplicación e iniciar sesión.</p>
                <a href="${BASE_URL}" style="padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">Ir a Iniciar Sesión</a>
            </div>
        `);
    } catch (error) {
        res.status(500).send('Error interno al verificar la cuenta.');
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password]);
        if (users.length === 0) return res.status(400).json({ error: 'Credenciales incorrectas.' });
        if (!users[0].verified) return res.status(400).json({ error: 'Por favor, verifica tu correo primero.' });

        res.json({ message: 'Inicio de sesión exitoso.', userId: users[0].id, username: users[0].username });
    } catch (error) {
        res.status(500).json({ error: 'Error en el inicio de sesión.' });
    }
});

app.post('/api/recover', async (req, res) => {
    const { email } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(400).json({ error: 'El correo no está registrado.' });

        const token = crypto.randomBytes(32).toString('hex');
        await pool.query('UPDATE users SET token = ? WHERE id = ?', [token, users[0].id]);

        const recoveryLink = `${BASE_URL}/api/reset-password.html?token=${token}`;

        const mailOptions = {
            from: MI_GMAIL,
            to: email,
            subject: 'Recuperación de Contraseña - Proyecto Notas',
            html: `<p>Hola,</p><p>Puedes restablecer tu contraseña usando el siguiente enlace:</p><a href="${recoveryLink}">${recoveryLink}</a>`
        };

        await emailTransporter.sendMail(mailOptions);
        res.json({ message: 'Correo de recuperación enviado.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al procesar la recuperación de contraseña.' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE token = ?', [token]);
        if (users.length === 0) return res.status(400).json({ error: 'El token de recuperación es inválido.' });

        await pool.query('UPDATE users SET password = ?, token = NULL WHERE id = ?', [newPassword, users[0].id]);
        res.json({ message: 'Contraseña actualizada con éxito.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al restablecer la contraseña.' });
    }
});

app.get('/api/notes', async (req, res) => {
    const userId = req.headers['user-id'];
    const [notes] = await pool.query('SELECT * FROM notes WHERE user_id = ?', [userId]);
    res.json(notes);
});

app.post('/api/notes', async (req, res) => {
    const { title, content, color, userId } = req.body;
    await pool.query('INSERT INTO notes (user_id, title, content, color) VALUES (?, ?, ?, ?)', [userId, title, content, color]);
    res.json({ message: 'Nota guardada exitosamente.' });
});

app.put('/api/notes/:id', async (req, res) => {
    const { title, content, color } = req.body;
    const { id } = req.params;
    await pool.query('UPDATE notes SET title = ?, content = ?, color = ? WHERE id = ?', [title, content, color, id]);
    res.json({ message: 'Nota actualizada correctamente.' });
});

app.delete('/api/notes/:id', async (req, res) => {
    const { id } = req.params;
    await pool.query('DELETE FROM notes WHERE id = ?', [id]);
    res.json({ message: 'Nota eliminada correctamente.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});