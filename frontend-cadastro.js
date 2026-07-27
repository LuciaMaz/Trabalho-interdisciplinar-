document.getElementById('formCadastro').addEventListener('submit', async (event) => {
    event.preventDefault(); // Impede a página de recarregar

    const usuarioInput = document.getElementById('usuario').value;
    const senhaInput = document.getElementById('senha').value;

    try {
        
        const response = await fetch('http://localhost:3000/api/cadastro', {
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
            alert('Cadastro realizado com sucesso!');
            // Depois que se cadastra, joga o aluno direto para a tela de login
            window.location.href = 'login_estudante.html'; 
        } else {
            alert(dados.error || 'Erro ao fazer cadastro.');
        }

    } catch (error) {
        console.error('Erro na requisição:', error);
        alert('Não foi possível conectar ao servidor backend.');
    }
});