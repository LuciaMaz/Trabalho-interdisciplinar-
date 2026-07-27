document.getElementById('formCadastroPedagogico').addEventListener('submit', async (event) => {
    event.preventDefault(); 

    const usuarioInput = document.getElementById('usuario').value;
    const senhaInput = document.getElementById('senha').value;

    try {
        
        const response = await fetch('http://localhost:3000/api/cadastro-pedagogico', {
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
            alert('Cadastro pedagógico realizado com sucesso!');
            
            window.location.href = 'login_professor.html'; 
        } else {
            alert(dados.error || 'Erro ao fazer cadastro.');
        }

    } catch (error) {
        console.error('Erro na requisição:', error);
        alert('Não foi possível conectar ao servidor backend.');
    }
});
