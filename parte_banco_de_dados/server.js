const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors()); 
app.use(express.json()); 


const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',      
    password: 'silvas123', 
    database: 'portfolios'
});


db.connect(err => {
    if (err) {
        console.error('Erro ao conectar ao MySQL:', err.message);
        throw err;
    }
    console.log('Conectado ao banco MySQL com sucesso!');
});


app.post('/api/cadastro', (req, res) => {
    const { login, senha } = req.body; 
    const query = 'INSERT INTO loginAlunos (Login, Senha) VALUES (?, ?)';
    
    db.query(query, [login, senha], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Aluno cadastrado com sucesso!', id: result.insertId });
    });
});


app.post('/api/login', (req, res) => {
    const { login, senha } = req.body;
    const query = 'SELECT * FROM loginAlunos WHERE Login = ? AND Senha = ?';

    db.query(query, [login, senha], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) {
            return res.status(401).json({ error: 'Login ou senha incorretos!' });
        }
        res.json({ 
            message: 'Login de aluno realizado com sucesso!', 
            user: { id: results[0].ID, login: results[0].Login } 
        });
    });
});



app.post('/api/cadastro-pedagogico', (req, res) => {
    const { login, senha } = req.body; 
    const query = 'INSERT INTO loginPedagogico (Login, Senha) VALUES (?, ?)';
    
    db.query(query, [login, senha], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Membro do pedagógico cadastrado com sucesso!', id: result.insertId });
    });
});


app.post('/api/login-pedagogico', (req, res) => {
    const { login, senha } = req.body;
    const query = 'SELECT * FROM loginPedagogico WHERE Login = ? AND Senha = ?';

    db.query(query, [login, senha], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) {
            return res.status(401).json({ error: 'Login ou senha pedagógica incorretos!' });
        }
        res.json({ 
            message: 'Login pedagógico realizado com sucesso!', 
            user: { id: results[0].ID, login: results[0].Login } 
        });
    });
});


app.get('/api/usuarios', (req, res) => {
    const query = 'SELECT * FROM loginAlunos';
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});


const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando perfeitamente na porta ${PORT}`);
});