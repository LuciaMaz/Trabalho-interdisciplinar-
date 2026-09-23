USE portfolios;

-- Cada conta de aluno precisa apontar para exatamente um arquivo da pasta alunos.
-- O valor deve ser somente o nome do arquivo, sem ".html".
SET @portfolio_column_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'loginAlunos'
      AND COLUMN_NAME = 'Portfolio'
);

SET @add_portfolio_column = IF(
    @portfolio_column_exists = 0,
    'ALTER TABLE loginAlunos ADD COLUMN Portfolio VARCHAR(100) NULL',
    'SELECT ''A coluna Portfolio já existe'' AS Resultado'
);

PREPARE portfolio_statement FROM @add_portfolio_column;
EXECUTE portfolio_statement;
DEALLOCATE PREPARE portfolio_statement;

-- Configure uma linha por aluno usando o Login que já existe no seu banco.
-- Exemplos (troque o texto LOGIN_DA_ANA pelo login real antes de executar):
-- UPDATE loginAlunos SET Portfolio = 'ana' WHERE Login = 'LOGIN_DA_ANA';
-- UPDATE loginAlunos SET Portfolio = 'wendel' WHERE Login = 'LOGIN_DO_WENDEL';

-- Valores aceitos atualmente:
-- amariles, ana, anny, bruno, eduarda, fernanda, gustavo, henrique,
-- jeferson, leonardo, luan, lucas, monica, nathaly, nayla, paulo,
-- pedro, rafaelly, renilson, samara, samira, wendel, yasmin.

SELECT ID, Login, Portfolio
FROM loginAlunos
ORDER BY Login;
