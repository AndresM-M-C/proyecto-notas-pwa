const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'Proyecto notas')));

let pool;
let emailTransporter;

async function initServer() {
    try {
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306,
            waitForConnections: true,
            connectionLimit: 10
        });

        const connection = await pool.getConnection();
        await connection.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        connection.release();

        emailTransporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            tls: { rejectUnauthorized: false }
        });

        console.log('Servidor inicializado correctamente.');
    } catch (error) {
        console.error('Error al inicializar:', error.message);
    }
}

// 1. REGISTRO
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;
    try {
        await pool.query('INSERT INTO usuarios (email, password) VALUES (?, ?)', [email, password]);
        res.status(200).json({ success: true, message: 'Usuario registrado.' });

        if (emailTransporter) {
            emailTransporter.sendMail({
                from: `"Proyecto Notas" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Bienvenido',
                text: 'Cuenta creada con éxito.'
            }).catch(e => console.log('Envío de correo omitido:', e.message));
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);
        if (rows.length > 0 && rows[0].password === password) {
            res.status(200).json({ success: true });
        } else {
            res.status(401).json({ error: 'Credenciales inválidas.' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error de servidor.' });
    }
});

// 3. RECUPERAR CONTRASEÑA
app.post('/api/recover', async (req, res) => {
    const { email } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(404).json({ error: 'Correo no encontrado.' });

        res.status(200).json({ success: true, message: 'Solicitud procesada.' });

        if (emailTransporter) {
            emailTransporter.sendMail({
                from: `"Proyecto Notas" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Recuperación',
                text: `Tu contraseña es: ${rows[0].password}`
            }).catch(e => console.log('Envío de recuperación omitido:', e.message));
        }
    } catch (error) {
        res.status(500).json({ error: 'Error de servidor.' });
    }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'Proyecto notas', 'index.html')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
    await initServer();
    console.log(`Servidor en puerto ${PORT}`);
});
