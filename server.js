const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // módulo nativo de Node, no requiere instalación por npm

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'Proyecto notas')));

let pool;
let emailTransporter;

// URL pública de la app (Railway la inyecta, o defínela tú en variables de entorno)
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 8080}`;
const JWT_SECRET = process.env.JWT_SECRET; // OBLIGATORIO definir en Railway

async function initServer() {
    try {
        if (!process.env.JWT_SECRET) {
            console.error('FALTA JWT_SECRET en las variables de entorno. El servidor no debe arrancar sin esto.');
            process.exit(1);
        }

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
                verificado BOOLEAN NOT NULL DEFAULT FALSE,
                token_verificacion VARCHAR(255) NULL,
                token_recuperacion VARCHAR(255) NULL,
                token_expira DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS notas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT NOT NULL,
                titulo VARCHAR(255) NOT NULL DEFAULT '',
                contenido TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
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
            }
        });

        // Verifica la conexión SMTP al iniciar, para detectar credenciales mal configuradas
        // en los logs de Railway en vez de descubrirlo cuando un usuario intenta registrarse.
        try {
            await emailTransporter.verify();
            console.log('Conexión SMTP verificada correctamente.');
        } catch (smtpError) {
            console.error('ADVERTENCIA: no se pudo verificar la conexión SMTP:', smtpError.message);
            console.error('Revisa EMAIL_USER y EMAIL_PASS (debe ser una contraseña de aplicación de Gmail, no la contraseña normal).');
        }

        console.log('Servidor inicializado correctamente.');
    } catch (error) {
        console.error('Error al inicializar:', error.message);
    }
}

// ---------- Middleware de autenticación ----------
function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autenticado.' });
    }
    const token = header.split(' ')[1];
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.userId = payload.userId;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado.' });
    }
}

// ---------- Helper de envío de correo ----------
async function enviarCorreo(to, subject, html) {
    if (!emailTransporter) {
        console.error('emailTransporter no está inicializado, no se puede enviar correo.');
        return;
    }
    try {
        await emailTransporter.sendMail({
            from: `"Proyecto Notas" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html
        });
        console.log(`Correo "${subject}" enviado a ${to}`);
    } catch (e) {
        console.error(`Error enviando correo a ${to}:`, e.message);
    }
}

// 1. REGISTRO
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const token = crypto.randomBytes(32).toString('hex');

        await pool.query(
            'INSERT INTO usuarios (email, password, token_verificacion) VALUES (?, ?, ?)',
            [email, hashedPassword, token]
        );

        const verifyUrl = `${BASE_URL}/api/verify?token=${token}`;

        await enviarCorreo(
            email,
            'Verifica tu cuenta - Proyecto Notas',
            `<p>Gracias por registrarte. Haz clic en el siguiente enlace para verificar tu cuenta:</p>
             <p><a href="${verifyUrl}">${verifyUrl}</a></p>
             <p>Si no creaste esta cuenta, ignora este correo.</p>`
        );

        res.status(200).json({ success: true, message: 'Usuario registrado. Revisa tu correo para verificar la cuenta.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ese correo ya está registrado.' });
        }
        res.status(500).json({ error: error.message });
    }
});

// 2. VERIFICACIÓN DE CORREO (enlace)
app.get('/api/verify', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).send('Token faltante.');

    try {
        const [rows] = await pool.query('SELECT id FROM usuarios WHERE token_verificacion = ?', [token]);
        if (rows.length === 0) {
            return res.status(400).send('Enlace de verificación inválido o ya utilizado.');
        }

        await pool.query(
            'UPDATE usuarios SET verificado = TRUE, token_verificacion = NULL WHERE id = ?',
            [rows[0].id]
        );

        // Redirige al login del frontend con un indicador de éxito
        res.redirect('/?verificado=1');
    } catch (error) {
        res.status(500).send('Error de servidor al verificar la cuenta.');
    }
});

// 3. LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const usuario = rows[0];
        const passwordOk = await bcrypt.compare(password, usuario.password);
        if (!passwordOk) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        if (!usuario.verificado) {
            return res.status(403).json({ error: 'Debes verificar tu correo antes de iniciar sesión.' });
        }

        const token = jwt.sign({ userId: usuario.id }, JWT_SECRET, { expiresIn: '7d' });
        res.status(200).json({ success: true, token });
    } catch (error) {
        res.status(500).json({ error: 'Error de servidor.' });
    }
});

// 4. SOLICITAR RECUPERACIÓN DE CONTRASEÑA (enlace)
app.post('/api/recover', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Correo es obligatorio.' });

    try {
        const [rows] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);

        // Responder siempre el mismo mensaje exista o no el correo, para no filtrar
        // qué correos están registrados (buena práctica de seguridad).
        if (rows.length === 0) {
            return res.status(200).json({ success: true, message: 'Si el correo existe, recibirás un enlace de recuperación.' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

        await pool.query(
            'UPDATE usuarios SET token_recuperacion = ?, token_expira = ? WHERE id = ?',
            [token, expira, rows[0].id]
        );

        const resetUrl = `${BASE_URL}/reset-password.html?token=${token}`;

        await enviarCorreo(
            email,
            'Recupera tu contraseña - Proyecto Notas',
            `<p>Solicitaste recuperar tu contraseña. Haz clic en el siguiente enlace (válido por 1 hora):</p>
             <p><a href="${resetUrl}">${resetUrl}</a></p>
             <p>Si no solicitaste esto, ignora este correo.</p>`
        );

        res.status(200).json({ success: true, message: 'Si el correo existe, recibirás un enlace de recuperación.' });
    } catch (error) {
        res.status(500).json({ error: 'Error de servidor.' });
    }
});

// 5. ESTABLECER NUEVA CONTRASEÑA (desde el enlace de recuperación)
app.post('/api/reset-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) {
        return res.status(400).json({ error: 'Token y nueva contraseña son obligatorios.' });
    }

    try {
        const [rows] = await pool.query(
            'SELECT id, token_expira FROM usuarios WHERE token_recuperacion = ?',
            [token]
        );

        if (rows.length === 0) {
            return res.status(400).json({ error: 'Enlace inválido o ya utilizado.' });
        }

        const usuario = rows[0];
        if (new Date(usuario.token_expira) < new Date()) {
            return res.status(400).json({ error: 'El enlace ha expirado. Solicita uno nuevo.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            'UPDATE usuarios SET password = ?, token_recuperacion = NULL, token_expira = NULL WHERE id = ?',
            [hashedPassword, usuario.id]
        );

        res.status(200).json({ success: true, message: 'Contraseña actualizada correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error de servidor.' });
    }
});

// ---------- CRUD DE NOTAS (requiere autenticación) ----------

// Listar notas del usuario autenticado
app.get('/api/notas', authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, titulo, contenido, created_at, updated_at FROM notas WHERE usuario_id = ? ORDER BY updated_at DESC',
            [req.userId]
        );
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error de servidor.' });
    }
});

// Crear nota
app.post('/api/notas', authMiddleware, async (req, res) => {
    const { titulo, contenido } = req.body;
    try {
        const [result] = await pool.query(
            'INSERT INTO notas (usuario_id, titulo, contenido) VALUES (?, ?, ?)',
            [req.userId, titulo || '', contenido || '']
        );
        res.status(201).json({ success: true, id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Error de servidor.' });
    }
});

// Editar nota (solo si pertenece al usuario autenticado)
app.put('/api/notas/:id', authMiddleware, async (req, res) => {
    const { titulo, contenido } = req.body;
    try {
        const [result] = await pool.query(
            'UPDATE notas SET titulo = ?, contenido = ? WHERE id = ? AND usuario_id = ?',
            [titulo || '', contenido || '', req.params.id, req.userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Nota no encontrada.' });
        }
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error de servidor.' });
    }
});

// Eliminar nota (solo si pertenece al usuario autenticado)
app.delete('/api/notas/:id', authMiddleware, async (req, res) => {
    try {
        const [result] = await pool.query(
            'DELETE FROM notas WHERE id = ? AND usuario_id = ?',
            [req.params.id, req.userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Nota no encontrada.' });
        }
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error de servidor.' });
    }
});

// Catch-all para servir el frontend (debe ir al final, después de las rutas /api)
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'Proyecto notas', 'index.html')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
    await initServer();
    console.log(`Servidor en puerto ${PORT}`);
});
