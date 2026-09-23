const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const mysql = require('mysql2');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const STUDENTS_DIRECTORY = path.join(PROJECT_ROOT, 'alunos');
const SESSION_COOKIE = 'portfolio_session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const STUDENT_LOGIN = '/parte_banco_de_dados/login_estudante.html';
const LOGIN_SELECTION = '/parte_banco_de_dados/banco-de-dados-inicial.html';
const PEDAGOGICAL_HOME = '/parte_banco_de_dados/pagina_total.html';

function listPortfolios(studentsDirectory = STUDENTS_DIRECTORY) {
    return new Set(
        fs.readdirSync(studentsDirectory)
            .filter(file => file.endsWith('.html'))
            .map(file => path.basename(file, '.html'))
    );
}

function normalizePortfolio(value) {
    if (typeof value !== 'string') return null;

    const portfolio = value.trim().replace(/\.html$/i, '').toLowerCase();
    return /^[a-z0-9_-]+$/.test(portfolio) ? portfolio : null;
}

function createSessionStore({ durationMs = SESSION_DURATION_MS } = {}) {
    const sessions = new Map();

    return {
        create(data) {
            const token = crypto.randomBytes(32).toString('hex');
            sessions.set(token, { ...data, expiresAt: Date.now() + durationMs });
            return token;
        },

        get(token) {
            if (!token) return null;

            const session = sessions.get(token);
            if (!session) return null;

            if (session.expiresAt <= Date.now()) {
                sessions.delete(token);
                return null;
            }

            return session;
        },

        destroy(token) {
            if (token) sessions.delete(token);
        }
    };
}

function parseCookies(header = '') {
    return header.split(';').reduce((cookies, item) => {
        const separator = item.indexOf('=');
        if (separator === -1) return cookies;

        const name = item.slice(0, separator).trim();
        const value = item.slice(separator + 1).trim();
        if (name) cookies[name] = decodeURIComponent(value);
        return cookies;
    }, {});
}

function sessionCookie(token) {
    const secure = process.env.SESSION_COOKIE_SECURE === 'true' ? '; Secure' : '';
    return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DURATION_MS / 1000}${secure}`;
}

function expiredSessionCookie() {
    return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function query(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (error, results) => {
            if (error) reject(error);
            else resolve(results);
        });
    });
}

function validCredentials(login, senha) {
    return typeof login === 'string'
        && typeof senha === 'string'
        && login.trim().length > 0
        && senha.length > 0;
}

function createApp({
    db,
    sessions = createSessionStore(),
    projectRoot = PROJECT_ROOT,
    logger = console
} = {}) {
    if (!db || typeof db.query !== 'function') {
        throw new TypeError('Uma conexão com o banco de dados deve ser informada.');
    }

    const app = express();
    const studentsDirectory = path.join(projectRoot, 'alunos');
    const portfolios = listPortfolios(studentsDirectory);

    app.disable('x-powered-by');
    app.use(express.json({ limit: '10kb' }));

    app.use((req, _res, next) => {
        const cookies = parseCookies(req.headers.cookie);
        req.sessionToken = cookies[SESSION_COOKIE] || null;
        req.authenticatedUser = sessions.get(req.sessionToken);
        next();
    });

    function requirePedagogicalApi(req, res, next) {
        if (!req.authenticatedUser) {
            return res.status(401).json({ error: 'Faça login para continuar.' });
        }

        if (req.authenticatedUser.role !== 'pedagogico') {
            return res.status(403).json({ error: 'Acesso permitido somente ao pedagógico.' });
        }

        next();
    }

    function databaseError(res, error) {
        logger.error('Erro ao consultar o MySQL:', error);

        if (error && error.code === 'ER_BAD_FIELD_ERROR') {
            return res.status(500).json({
                error: 'O banco ainda não possui o campo Portfolio. Execute database.sql no MySQL Workbench.'
            });
        }

        return res.status(500).json({ error: 'Não foi possível acessar o banco de dados.' });
    }

    app.post('/api/login', async (req, res) => {
        const { login, senha } = req.body || {};
        if (!validCredentials(login, senha)) {
            return res.status(400).json({ error: 'Informe login e senha.' });
        }

        try {
            const results = await query(
                db,
                'SELECT ID, Login, Portfolio FROM loginAlunos WHERE Login = ? AND Senha = ? LIMIT 1',
                [login.trim(), senha]
            );

            if (results.length === 0) {
                return res.status(401).json({ error: 'Login ou senha incorretos!' });
            }

            const portfolio = normalizePortfolio(results[0].Portfolio);
            if (!portfolio || !portfolios.has(portfolio)) {
                return res.status(403).json({
                    error: 'Esta conta ainda não possui um portfólio válido configurado.'
                });
            }

            sessions.destroy(req.sessionToken);
            const token = sessions.create({
                role: 'aluno',
                userId: results[0].ID,
                portfolio
            });

            res.set('Set-Cookie', sessionCookie(token));
            return res.json({
                message: 'Login de aluno realizado com sucesso!',
                redirect: `/alunos/${portfolio}.html`
            });
        } catch (error) {
            return databaseError(res, error);
        }
    });

    app.post('/api/login-pedagogico', async (req, res) => {
        const { login, senha } = req.body || {};
        if (!validCredentials(login, senha)) {
            return res.status(400).json({ error: 'Informe login e senha.' });
        }

        try {
            const results = await query(
                db,
                'SELECT ID FROM loginPedagogico WHERE Login = ? AND Senha = ? LIMIT 1',
                [login.trim(), senha]
            );

            if (results.length === 0) {
                return res.status(401).json({ error: 'Login ou senha pedagógica incorretos!' });
            }

            sessions.destroy(req.sessionToken);
            const token = sessions.create({
                role: 'pedagogico',
                userId: results[0].ID
            });

            res.set('Set-Cookie', sessionCookie(token));
            return res.json({
                message: 'Login pedagógico realizado com sucesso!',
                redirect: PEDAGOGICAL_HOME
            });
        } catch (error) {
            return databaseError(res, error);
        }
    });

    app.get('/api/session', (req, res) => {
        res.set('Cache-Control', 'no-store');

        if (!req.authenticatedUser) {
            return res.status(401).json({ authenticated: false });
        }

        const response = {
            authenticated: true,
            role: req.authenticatedUser.role
        };

        if (req.authenticatedUser.role === 'aluno') {
            response.portfolio = req.authenticatedUser.portfolio;
        }

        return res.json(response);
    });

    app.post('/api/logout', (req, res) => {
        sessions.destroy(req.sessionToken);
        res.set('Set-Cookie', expiredSessionCookie());
        res.set('Cache-Control', 'no-store');
        return res.json({ message: 'Sessão encerrada com sucesso.' });
    });

    app.post('/api/cadastro', requirePedagogicalApi, async (req, res) => {
        const { login, senha } = req.body || {};
        const portfolio = normalizePortfolio(req.body && req.body.portfolio);

        if (!validCredentials(login, senha) || !portfolio || !portfolios.has(portfolio)) {
            return res.status(400).json({
                error: 'Informe login, senha e um portfólio existente.'
            });
        }

        try {
            const result = await query(
                db,
                'INSERT INTO loginAlunos (Login, Senha, Portfolio) VALUES (?, ?, ?)',
                [login.trim(), senha, portfolio]
            );
            return res.json({ message: 'Aluno cadastrado com sucesso!', id: result.insertId });
        } catch (error) {
            return databaseError(res, error);
        }
    });

    app.post('/api/cadastro-pedagogico', requirePedagogicalApi, async (req, res) => {
        const { login, senha } = req.body || {};
        if (!validCredentials(login, senha)) {
            return res.status(400).json({ error: 'Informe login e senha.' });
        }

        try {
            const result = await query(
                db,
                'INSERT INTO loginPedagogico (Login, Senha) VALUES (?, ?)',
                [login.trim(), senha]
            );
            return res.json({
                message: 'Membro do pedagógico cadastrado com sucesso!',
                id: result.insertId
            });
        } catch (error) {
            return databaseError(res, error);
        }
    });

    app.get('/api/usuarios', requirePedagogicalApi, async (_req, res) => {
        try {
            const results = await query(db, 'SELECT ID, Login, Portfolio FROM loginAlunos');
            return res.json(results);
        } catch (error) {
            return databaseError(res, error);
        }
    });

    app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();

        let requestPath;
        try {
            requestPath = path.posix.normalize(decodeURIComponent(req.path).replace(/\/{2,}/g, '/'));
        } catch (_error) {
            return res.sendStatus(400);
        }

        if (requestPath === PEDAGOGICAL_HOME) {
            res.set('Cache-Control', 'no-store');

            if (!req.authenticatedUser) return res.redirect(LOGIN_SELECTION);
            if (req.authenticatedUser.role === 'aluno') {
                return res.redirect(`/alunos/${req.authenticatedUser.portfolio}.html`);
            }

            return res.sendFile(
                path.join(projectRoot, 'parte_banco_de_dados', 'pagina_total.html')
            );
        }

        if (!requestPath.startsWith('/alunos/') || !requestPath.endsWith('.html')) {
            return next();
        }

        const relativeFile = requestPath.slice('/alunos/'.length);
        const portfolio = normalizePortfolio(relativeFile);
        if (!portfolio || !portfolios.has(portfolio)) return res.sendStatus(404);

        res.set('Cache-Control', 'no-store');
        if (!req.authenticatedUser) return res.redirect(STUDENT_LOGIN);

        if (
            req.authenticatedUser.role === 'aluno'
            && req.authenticatedUser.portfolio !== portfolio
        ) {
            return res.redirect(`/alunos/${req.authenticatedUser.portfolio}.html`);
        }

        return res.sendFile(path.join(studentsDirectory, `${portfolio}.html`));
    });

    app.use('/parte_banco_de_dados', (req, res, next) => {
        const blocked = /^(?:\/(?:node_modules|test)(?:\/|$)|\/(?:server\.js|database\.sql|package(?:-lock)?\.json|arquivo\.txt))$/i;
        if (blocked.test(req.path)) return res.sendStatus(404);
        return next();
    });

    app.use(express.static(projectRoot, { dotfiles: 'deny', index: false }));
    app.get('/', (_req, res) => res.sendFile(path.join(projectRoot, 'index.html')));

    return app;
}

function createDatabase() {
    return mysql.createPool({
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'silvas123',
        database: process.env.DB_NAME || 'portfolios',
        connectionLimit: 5
    });
}

if (require.main === module) {
    const db = createDatabase();
    const app = createApp({ db });
    const port = Number(process.env.PORT) || 3000;

    app.listen(port, () => {
        console.log(`Servidor disponível em http://localhost:${port}`);

        db.getConnection((error, connection) => {
            if (error) {
                console.error('MySQL indisponível. Confira o Workbench e as credenciais:', error.message);
                return;
            }

            connection.release();
            console.log('Conectado ao banco MySQL com sucesso!');
        });
    });
}

module.exports = {
    createApp,
    createDatabase,
    createSessionStore,
    listPortfolios
};
