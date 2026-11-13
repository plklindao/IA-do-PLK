// =====================================================================
// AULA 04 - GABARITO DO PROFESSOR - Agente com memória no MySQL
// =====================================================================
// PROFESSOR - o problema que esta aula resolve:
//   Aulas 01 e 03: a conversa vivia num array no navegador. Recarregou a
//   página (F5), o agente esqueceu tudo. Demonstrar isso na aula 03 antes
//   de começar: dizer o nome, dar F5, perguntar o nome.
//
// PROFESSOR - a ideia central:
//   O modelo continua SEM memória. Ele nunca lembra de nada. O que muda
//   é ONDE guardamos a conversa: antes no navegador, agora no banco.
//   A cada pergunta: lê o histórico do banco -> manda tudo para o modelo
//   -> salva a pergunta e a resposta. "Memória" = SELECT + INSERT.
//
// PROFESSOR - como rodar:
//   Uma vez:     mysql -u aluno -paluno123 loja_ia < memoria.sql
//   Terminal:    cd aula04-memoria && npm install && node server.js
//   (Não precisa da API da aula 02: o agente lê o MySQL direto.)
//   Abrir http://localhost:3003
//
// PROFESSOR - partir do server.js da aula 03. Os blocos 3 e 4 (ferramentas
// e laço do agente) são IGUAIS. Novidades: BLOCO 2 (banco) e BLOCO 6 (rotas).
// =====================================================================

// ---------- BLOCO 1: configuração ----------
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORTA = 3003;
const URL_OLLAMA = 'http://localhost:11434/api/chat';
const MODELO = 'qwen2.5:3b';

// PROFESSOR: quantas mensagens antigas mandamos ao modelo. Não dá para
// mandar a conversa inteira para sempre: o modelo tem limite de texto
// (contexto) e fica mais lento a cada mensagem. 20 = últimas 10 trocas.
// Exercício: baixar para 2 e ver o agente esquecer o começo da conversa.
const LIMITE_HISTORICO = 20;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// PROFESSOR: mudou em relação à aula 03 -> a última linha. Sem ela o
// agente trata "qual é o meu nome?" como pergunta fora da loja e recusa.
const PROMPT_SISTEMA = `Você é o atendente virtual de uma loja de informática.
Responda sempre em português, de forma curta.
Para qualquer pergunta sobre produtos, clientes ou pedidos, use sempre uma ferramenta antes de responder.
Nunca invente dados: responda apenas com o que as ferramentas devolverem.
Liste todos os itens que a ferramenta devolver, sem pular nenhum.
Se a ferramenta devolver uma lista vazia, diga que a loja não tem.
Lembre do que o cliente já disse nesta conversa (nome, preferências) e use isso nas respostas.`;

// ---------- BLOCO 2: banco e funções de memória (NOVO) ----------
// PROFESSOR: mesmo usuário e banco da aula 02. A tabela "mensagens" vem
// do memoria.sql. Olhar a tabela no MySQL durante a aula, com o chat
// aberto ao lado:  SELECT * FROM mensagens;
const banco = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'escola',
  database: 'loja_ia'
});

// Lê as últimas mensagens de uma conversa, da mais antiga para a mais nova.
// PROFESSOR: o SELECT de dentro pega as 20 MAIS NOVAS (ORDER BY id DESC).
// O de fora coloca de volta na ordem certa de leitura. Se usar só ASC com
// LIMIT, viriam as 20 mais ANTIGAS e o agente esqueceria o que é recente.
async function lerHistorico(conversa) {
  const [linhas] = await banco.query(
    `SELECT role, content FROM (
       SELECT id, role, content FROM mensagens
       WHERE conversa = ? ORDER BY id DESC LIMIT ?
     ) AS ultimas ORDER BY id`,
    [conversa, LIMITE_HISTORICO]
  );
  return linhas;
}

async function salvarMensagem(conversa, role, content) {
  await banco.query(
    'INSERT INTO mensagens (conversa, role, content) VALUES (?, ?, ?)',
    [conversa, role, content]
  );
}

// ---------- BLOCO 3: funções e ferramentas (igual aula 03) ----------
// PROFESSOR: as ferramentas leem o MySQL direto (mesmas consultas da aula
// 02, com "?"). Um servidor só, sem a API da aula 02 no meio.
// Quem filtra é o SQL (WHERE), não o modelo: modelo pequeno erra ao
// filtrar lista grande de cabeça.
const funcoes = {
  listar_produtos: async (args) => {
    let sql = 'SELECT * FROM produtos WHERE 1 = 1';
    const valores = [];
    if (args.categoria) {
      sql += ' AND categoria = ?';
      valores.push(args.categoria);
    }
    if (args.sem_estoque) sql += ' AND estoque = 0';
    const [linhas] = await banco.query(sql, valores);
    return linhas;
  },
  listar_clientes: async (args) => {
    if (args.cidade) {
      const [linhas] = await banco.query('SELECT * FROM clientes WHERE cidade = ?', [args.cidade]);
      return linhas;
    }
    const [linhas] = await banco.query('SELECT * FROM clientes');
    return linhas;
  },
  listar_pedidos: async (args) => {
    const [linhas] = await banco.query(`
      SELECT
        pedidos.id,
        clientes.nome AS cliente,
        produtos.nome AS produto,
        pedidos.quantidade,
        produtos.preco * pedidos.quantidade AS total,
        DATE_FORMAT(pedidos.data_pedido, '%Y-%m-%d') AS data_pedido,
        pedidos.status
      FROM pedidos
      JOIN clientes ON clientes.id = pedidos.cliente_id
      JOIN produtos ON produtos.id = pedidos.produto_id
      WHERE ? IS NULL OR pedidos.status = ?
      ORDER BY pedidos.id
    `, [args.status || null, args.status || null]);
    return linhas;
  }
};

const ferramentas = [
  {
    type: 'function',
    function: {
      name: 'listar_produtos',
      description: 'Lista os produtos da loja com nome, categoria, preço e estoque. Estoque 0 significa produto em falta.',
      parameters: {
        type: 'object',
        properties: {
          categoria: {
            type: 'string',
            description: 'Opcional. Filtra por categoria: Periféricos, Áudio, Monitores, Armazenamento, Computadores ou Móveis.'
          },
          sem_estoque: {
            type: 'boolean',
            description: 'Opcional. Use true para trazer só os produtos em falta (estoque 0).'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listar_clientes',
      description: 'Lista os clientes da loja com nome, email e cidade.',
      parameters: {
        type: 'object',
        properties: {
          cidade: {
            type: 'string',
            description: 'Opcional. Traz só os clientes desta cidade.'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listar_pedidos',
      description: 'Lista os pedidos com nome do cliente, produto, quantidade, total, data e status.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pendente', 'enviado', 'entregue', 'cancelado'],
            description: 'Opcional. Traz só os pedidos com este status.'
          }
        }
      }
    }
  }
];

// ---------- BLOCO 4: laço do agente (igual aula 03) ----------
async function rodarAgente(mensagens) {
  const usadas = [];

  for (let volta = 0; volta < 5; volta++) {
    const resposta = await fetch(URL_OLLAMA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODELO, messages: mensagens, tools: ferramentas, stream: false })
    });
    if (!resposta.ok) throw new Error('Ollama respondeu HTTP ' + resposta.status);

    const mensagem = (await resposta.json()).message;
    mensagens.push(mensagem);

    if (!mensagem.tool_calls) {
      return { resposta: mensagem.content, ferramentas: usadas };
    }

    for (const chamada of mensagem.tool_calls) {
      const nome = chamada.function.name;
      const funcao = funcoes[nome];
      const resultado = funcao
        ? await funcao(chamada.function.arguments || {})
        : { erro: 'Ferramenta ' + nome + ' não existe' };

      console.log('Ferramenta:', nome, JSON.stringify(chamada.function.arguments));
      usadas.push(nome);
      mensagens.push({ role: 'tool', tool_name: nome, content: JSON.stringify(resultado) });
    }
  }

  return { resposta: 'Não consegui chegar a uma resposta.', ferramentas: usadas };
}

// ---------- BLOCO 5: validação ----------
// PROFESSOR: nunca confiar no que vem do navegador. O id da conversa tem
// que ser um texto curto e o texto da pergunta não pode ser vazio/gigante.
function entradaValida(conversa, texto) {
  return typeof conversa === 'string' && conversa.length > 0 && conversa.length <= 36
    && typeof texto === 'string' && texto.trim().length > 0 && texto.length <= 2000;
}

// ---------- BLOCO 6: rotas (NOVO) ----------

// A página chama isto ao abrir, para redesenhar a conversa antiga.
app.get('/historico/:conversa', async (req, res) => {
  res.json(await lerHistorico(req.params.conversa));
});

// PROFESSOR: os 4 passos da memória, nesta ordem:
//   1. LER o histórico do banco
//   2. MONTAR: sistema + histórico + pergunta nova
//   3. RODAR o agente
//   4. SALVAR pergunta e resposta
// Salvamos só DEPOIS da resposta: se o Ollama falhar, não fica pergunta
// sem resposta no banco.
// Não salvamos as mensagens de ferramenta (role 'tool'): o resultado da
// banco pode mudar (estoque, pedidos), então o agente consulta de novo.
app.post('/chat', async (req, res) => {
  const { conversa, texto } = req.body;
  if (!entradaValida(conversa, texto)) {
    return res.status(400).json({ erro: 'Envie conversa e texto.' });
  }

  const historico = await lerHistorico(conversa);                    // 1
  // PROFESSOR: o histórico vai como TEXTO dentro do prompt de sistema, e
  // o modelo recebe só a pergunta nova como mensagem. Por quê: com o
  // histórico em mensagens separadas, o 3b passa a "imitar" as respostas
  // antigas e responde "não há pedidos" sem consultar nada. Teste real,
  // conversa de 5 perguntas: com mensagens separadas consultou 2 de 4
  // vezes; com o histórico em texto, 6 de 6, e lembrou o nome 6 de 6.
  // Para o aluno: memória = colar a conversa antiga no prompt.
  const textoHistorico = historico
    .map((m) => (m.role === 'user' ? 'Cliente: ' : 'Atendente: ') + m.content)
    .join('\n');
  const mensagens = [                                                // 2
    { role: 'system', content: PROMPT_SISTEMA + (historico.length ? '\n\nConversa até agora:\n' + textoHistorico : '') },
    { role: 'user', content: texto }
  ];
  const resultado = await rodarAgente(mensagens);                    // 3
  await salvarMensagem(conversa, 'user', texto);                     // 4
  await salvarMensagem(conversa, 'assistant', resultado.resposta);

  res.json(resultado);
});

app.use((erro, req, res, next) => {
  console.error(erro.message);
  res.status(500).json({ erro: 'Falha no servidor: ' + erro.message });
});

app.listen(PORTA, () => {
  console.log('Agente com memória no ar: http://localhost:' + PORTA);
});

// =====================================================================
// PROFESSOR - roteiro de demonstração:
//   1. "Meu nome é João e gosto de produtos de áudio."
//   2. F5 na página -> a conversa volta na tela.
//   3. Parar o servidor (Ctrl+C) e ligar de novo.
//   4. "Qual é o meu nome?" -> deve responder João.
//   5. Clicar em "Nova conversa" e perguntar o nome -> não sabe.
//   6. No MySQL: SELECT conversa, role, content FROM mensagens;
//
// PROFESSOR - exercícios (não resolvidos aqui):
//   a) Rota DELETE /historico/:conversa que apaga a conversa do banco,
//      e um botão "Esquecer tudo" na página.
//   b) Mudar LIMITE_HISTORICO para 2 e descobrir o que o agente esquece.
//   c) Mostrar a hora (criado_em) ao lado de cada mensagem antiga.
// =====================================================================
