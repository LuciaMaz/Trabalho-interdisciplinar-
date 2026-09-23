(function () {
    const STUDENT_LOGIN = '/parte_banco_de_dados/login_estudante.html';
    const LOGIN_SELECTION = '/parte_banco_de_dados/banco-de-dados-inicial.html';
    const PEDAGOGICAL_HOME = '/parte_banco_de_dados/pagina_total.html';

    async function getSession() {
        const response = await fetch('/api/session', {
            credentials: 'same-origin',
            cache: 'no-store'
        });

        if (!response.ok) return null;
        return response.json();
    }

    async function logout() {
        await fetch('/api/logout', {
            method: 'POST',
            credentials: 'same-origin'
        });
    }

    function redirectTo(path) {
        window.location.replace(path);
    }

    async function configurePedagogicalHome(button) {
        const session = await getSession();

        if (!session) return redirectTo(LOGIN_SELECTION);
        if (session.role !== 'pedagogico') {
            return redirectTo(`/alunos/${session.portfolio}.html`);
        }

        button.disabled = false;
        button.addEventListener('click', async () => {
            button.disabled = true;
            await logout();
            redirectTo(LOGIN_SELECTION);
        });
    }

    async function configurePortfolio() {
        const card = document.querySelector('main.card');
        if (!card) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'portfolio-voltar';
        button.textContent = 'Voltar';
        button.disabled = true;
        card.appendChild(button);

        const session = await getSession();
        if (!session) return redirectTo(STUDENT_LOGIN);

        button.disabled = false;
        button.addEventListener('click', async () => {
            button.disabled = true;

            if (session.role === 'pedagogico') {
                window.location.assign(PEDAGOGICAL_HOME);
                return;
            }

            await logout();
            redirectTo(STUDENT_LOGIN);
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        const logoutButton = document.getElementById('logout-pedagogico');

        const task = logoutButton
            ? configurePedagogicalHome(logoutButton)
            : configurePortfolio();

        task.catch(error => {
            console.error('Não foi possível verificar a sessão:', error);
            redirectTo(LOGIN_SELECTION);
        });
    });
}());
