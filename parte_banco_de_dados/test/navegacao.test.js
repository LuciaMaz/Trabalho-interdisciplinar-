const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { createApp } = require('../server');

const students = [
    { ID: 1, Login: 'ana.teste', Senha: 'senha-ana', Portfolio: 'ana' },
    { ID: 2, Login: 'wendel.teste', Senha: 'senha-wendel', Portfolio: 'wendel' }
];
const pedagogicalUsers = [
    { ID: 10, Login: 'pedagogico.teste', Senha: 'senha-pedagogico' }
];

function createFakeDatabase() {
    return {
        query(sql, params, callback) {
            if (sql.includes('FROM loginAlunos WHERE')) {
                const result = students.filter(user => (
                    user.Login === params[0] && user.Senha === params[1]
                ));
                return callback(null, result);
            }

            if (sql.includes('FROM loginPedagogico WHERE')) {
                const result = pedagogicalUsers.filter(user => (
                    user.Login === params[0] && user.Senha === params[1]
                ));
                return callback(null, result);
            }

            if (sql.includes('SELECT ID, Login, Portfolio FROM loginAlunos')) {
                return callback(null, students.map(({ ID, Login, Portfolio }) => ({
                    ID,
                    Login,
                    Portfolio
                })));
            }

            return callback(new Error(`Consulta não simulada: ${sql}`));
        }
    };
}

function sessionCookie(response) {
    const setCookie = response.headers.get('set-cookie');
    assert.ok(setCookie, 'O login deveria criar um cookie de sessão');
    return setCookie.split(';')[0];
}

let server;
let baseUrl;

before(async () => {
    const app = createApp({
        db: createFakeDatabase(),
        logger: { error() {} }
    });

    await new Promise(resolve => {
        server = app.listen(0, '127.0.0.1', resolve);
    });

    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
    });
});

async function login(endpoint, login, senha) {
    return fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, senha }),
        redirect: 'manual'
    });
}

async function authenticatedFetch(url, cookie, options = {}) {
    return fetch(`${baseUrl}${url}`, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Cookie: cookie
        },
        redirect: 'manual'
    });
}

test('acesso sem autenticação é redirecionado para o login', async () => {
    const portfolio = await fetch(`${baseUrl}/alunos/ana.html`, { redirect: 'manual' });
    assert.equal(portfolio.status, 302);
    assert.equal(portfolio.headers.get('location'), '/parte_banco_de_dados/login_estudante.html');

    const home = await fetch(`${baseUrl}/parte_banco_de_dados/pagina_total.html`, {
        redirect: 'manual'
    });
    assert.equal(home.status, 302);
    assert.equal(
        home.headers.get('location'),
        '/parte_banco_de_dados/banco-de-dados-inicial.html'
    );
});

test('aluno entra somente no próprio portfólio e não entra na home pedagógica', async () => {
    const response = await login('/api/login', 'ana.teste', 'senha-ana');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.redirect, '/alunos/ana.html');
    const cookie = sessionCookie(response);

    const ownPortfolio = await authenticatedFetch('/alunos/ana.html', cookie);
    assert.equal(ownPortfolio.status, 200);
    assert.match(await ownPortfolio.text(), /portfolio-navigation\.js/);

    const otherPortfolio = await authenticatedFetch('/alunos/wendel.html', cookie);
    assert.equal(otherPortfolio.status, 302);
    assert.equal(otherPortfolio.headers.get('location'), '/alunos/ana.html');

    const home = await authenticatedFetch('/parte_banco_de_dados/pagina_total.html', cookie);
    assert.equal(home.status, 302);
    assert.equal(home.headers.get('location'), '/alunos/ana.html');
});

test('logout do aluno invalida a sessão no servidor', async () => {
    const response = await login('/api/login', 'ana.teste', 'senha-ana');
    const cookie = sessionCookie(response);

    const logout = await authenticatedFetch('/api/logout', cookie, { method: 'POST' });
    assert.equal(logout.status, 200);

    const afterLogout = await authenticatedFetch('/alunos/ana.html', cookie);
    assert.equal(afterLogout.status, 302);
    assert.equal(
        afterLogout.headers.get('location'),
        '/parte_banco_de_dados/login_estudante.html'
    );
});

test('pedagógico abre a home e qualquer portfólio sem perder a sessão', async () => {
    const response = await login(
        '/api/login-pedagogico',
        'pedagogico.teste',
        'senha-pedagogico'
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.redirect, '/parte_banco_de_dados/pagina_total.html');
    const cookie = sessionCookie(response);

    const home = await authenticatedFetch('/parte_banco_de_dados/pagina_total.html', cookie);
    assert.equal(home.status, 200);
    const homeHtml = await home.text();
    assert.match(homeHtml, /id="logout-pedagogico"/);
    const portfolioFiles = fs.readdirSync(path.resolve(__dirname, '..', '..', 'alunos'))
        .filter(file => file.endsWith('.html'));
    for (const file of portfolioFiles) {
        assert.ok(homeHtml.includes(`../alunos/${file}`), `${file} não aparece na home`);
    }

    assert.equal((await authenticatedFetch('/alunos/ana.html', cookie)).status, 200);
    assert.equal((await authenticatedFetch('/alunos/wendel.html', cookie)).status, 200);

    const session = await authenticatedFetch('/api/session', cookie);
    assert.equal(session.status, 200);
    assert.deepEqual(await session.json(), {
        authenticated: true,
        role: 'pedagogico'
    });
});

test('logout pedagógico protege novamente a home', async () => {
    const response = await login(
        '/api/login-pedagogico',
        'pedagogico.teste',
        'senha-pedagogico'
    );
    const cookie = sessionCookie(response);

    assert.equal(
        (await authenticatedFetch('/api/logout', cookie, { method: 'POST' })).status,
        200
    );

    const home = await authenticatedFetch('/parte_banco_de_dados/pagina_total.html', cookie);
    assert.equal(home.status, 302);
    assert.equal(
        home.headers.get('location'),
        '/parte_banco_de_dados/banco-de-dados-inicial.html'
    );
});

test('lista de usuários é restrita ao pedagógico e nunca retorna senhas', async () => {
    assert.equal((await fetch(`${baseUrl}/api/usuarios`)).status, 401);

    const response = await login(
        '/api/login-pedagogico',
        'pedagogico.teste',
        'senha-pedagogico'
    );
    const users = await authenticatedFetch('/api/usuarios', sessionCookie(response));
    assert.equal(users.status, 200);

    const body = await users.json();
    assert.equal(body.length, students.length);
    assert.equal(Object.hasOwn(body[0], 'Senha'), false);
});

test('todos os portfólios carregam o mesmo script de navegação', () => {
    const studentsDirectory = path.resolve(__dirname, '..', '..', 'alunos');
    const portfolioFiles = fs.readdirSync(studentsDirectory)
        .filter(file => file.endsWith('.html'));

    assert.ok(portfolioFiles.length > 0);
    for (const file of portfolioFiles) {
        const html = fs.readFileSync(path.join(studentsDirectory, file), 'utf8');
        assert.match(html, /portfolio-navigation\.js/, file);
    }
});
