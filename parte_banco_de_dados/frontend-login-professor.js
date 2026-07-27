document.getElementById('formLoginProfessor').addEventListener('submit', async (event) => {
    event.preventDefault(); 

    const usuarioInput = document.getElementById('usuario').value;
    const senhaInput = document.getElementById('senha').value;

    try {
        
        const response = await fetch('http://localhost:3000/api/login-pedagogico', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                login: usuarioInput,
                senha: senhaInput
            })
        });

        const dados = await response.json();

        if (response.ok) {
            alert('Login pedagógico realizado com sucesso!');
            
            window.location.href = 'portfólios.html'; 
        } else {
            alert(dados.error || 'Erro ao fazer login.');
        }

    } catch (error) {
        console.error('Erro na requisição:', error);
        alert('Não foi possível conectar ao servidor backend.');
    }
});