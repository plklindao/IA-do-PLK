// Elementos de Login
const loginScreen = document.getElementById('login-screen');
const appPrincipal = document.getElementById('app-principal');
const loginForm = document.getElementById('login-form');
const loginNome = document.getElementById('login-nome');
const loginSenha = document.getElementById('login-senha');
const loginConfirma = document.getElementById('login-confirma');
const loginErro = document.getElementById('login-erro');
const btnSair = document.getElementById('btn-sair');

// Elementos do Chat
const chat = document.getElementById('chat');
const form = document.getElementById('form');
const pergunta = document.getElementById('pergunta');
const enviar = document.getElementById('enviar');
const nova = document.getElementById('nova');
const listaConversasEl = document.getElementById('lista-conversas');

let usuarioAtual = null;
try {
  usuarioAtual = JSON.parse(localStorage.getItem('usuario_logado'));
} catch {
  usuarioAtual = null;
}

let conversa = localStorage.getItem('conversa') || crypto.randomUUID();
localStorage.setItem('conversa', conversa);

let historicoSidebar = [];
try {
  historicoSidebar = JSON.parse(localStorage.getItem('historico_sidebar')) || [];
} catch {
  historicoSidebar = [];
}

// ==================== CONTROLE DE LOGIN ====================
function aplicarUsuarioNaTela(usuario) {
  usuarioAtual = usuario;
  const displayEl = document.getElementById('user-display-name');
  const heroTitulo = document.getElementById('hero-titulo');
  if (displayEl) displayEl.textContent = usuario.nome;
  if (heroTitulo) heroTitulo.textContent = `Olá, ${usuario.nome}. Como posso ajudar?`;
}

// Envia uma instrução silenciosa para a IA salvar o nome e mandar a primeira mensagem
async function enviarBoasVindasDaIA(nome) {
  registrarConversaNaSidebar(conversa, `Boas-vindas • ${nome}`);
  if (enviar) enviar.disabled = true;

  const balao = mostrar('msg assistant', 'Pensando...');

  try {
    const promptInicial = `Oi! Acabei de fazer login. Meu nome é ${nome}. Salve meu nome na sua memória e me mande a primeira mensagem de boas-vindas.`;
    const resposta = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversa: conversa, texto: promptInicial })
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Erro no servidor');

    balao.textContent = dados.resposta;
  } catch {
    balao.textContent = `Olá, ${nome}! Seu nome já está salvo na minha memória. Como posso ajudar você hoje?`;
  } finally {
    if (enviar) enviar.disabled = false;
    chat.scrollTop = chat.scrollHeight;
    pergunta?.focus();
  }
}

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = loginNome.value.trim();
  const senha = loginSenha.value;
  const confirma = loginConfirma.value;

  if (!nome || !senha) {
    loginErro.textContent = 'Preencha seu nome e sua senha.';
    loginErro.classList.remove('hidden');
    return;
  }

  // Verificação obrigatória da senha
  if (senha !== confirma) {
    loginErro.textContent = 'As senhas não são iguais. Verifique e digite novamente.';
    loginErro.classList.remove('hidden');
    loginConfirma.focus();
    return;
  }

  loginErro.classList.add('hidden');

  // Salva os dados do usuário
  const novoUsuario = { nome, senha };
  localStorage.setItem('usuario_logado', JSON.stringify(novoUsuario));

  // Inicia uma nova conversa limpa para a boas-vindas da IA
  conversa = crypto.randomUUID();
  localStorage.setItem('conversa', conversa);
  chat.innerHTML = '';

  aplicarUsuarioNaTela(novoUsuario);
  loginScreen.classList.add('hidden');
  appPrincipal.classList.remove('hidden');
  renderizarSidebar();

  // IA manda a primeira mensagem assim que o login é feito
  await enviarBoasVindasDaIA(nome);
});

btnSair?.addEventListener('click', () => {
  localStorage.removeItem('usuario_logado');
  usuarioAtual = null;
  loginForm.reset();
  loginErro.classList.add('hidden');
  appPrincipal.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  loginNome.focus();
});

// ==================== NAVEGAÇÃO DA BARRA LATERAL ====================
function ativarAba(viewId) {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewId);
  });

  document.querySelectorAll('.view-section').forEach((sec) => {
    sec.classList.toggle('hidden', sec.id !== viewId);
  });

  if (viewId === 'view-memoria') {
    atualizarPainelMemoria();
  }
}

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => ativarAba(btn.dataset.view));
});

function atualizarPainelMemoria() {
  const userEl = document.getElementById('mem-user-name');
  const sessionEl = document.getElementById('mem-session-id');
  const countEl = document.getElementById('mem-msg-count');
  const previewEl = document.getElementById('mem-preview');

  const msgsNaTela = chat.querySelectorAll('.msg');
  if (userEl) userEl.textContent = usuarioAtual ? usuarioAtual.nome : 'Não definido';
  if (sessionEl) sessionEl.textContent = conversa;
  if (countEl) countEl.textContent = msgsNaTela.length;

  if (!previewEl) return;
  previewEl.innerHTML = '';

  if (msgsNaTela.length === 0) {
    previewEl.innerHTML = '<div class="mem-row">Nenhuma mensagem salva nesta sessão ainda.</div>';
    return;
  }

  msgsNaTela.forEach((el) => {
    const row = document.createElement('div');
    row.className = 'mem-row';
    const autor = el.classList.contains('user') ? (usuarioAtual?.nome || 'Você') : 'Agente';
    row.innerHTML = `<strong>${autor}</strong><span></span>`;
    row.querySelector('span').textContent = el.textContent;
    previewEl.appendChild(row);
  });
}

document.getElementById('btn-limpar-lista')?.addEventListener('click', () => {
  historicoSidebar = [];
  localStorage.removeItem('historico_sidebar');
  renderizarSidebar();
});

document.querySelectorAll('.btn-test-tool').forEach((btn) => {
  btn.addEventListener('click', () => {
    ativarAba('view-chat');
    pergunta.value = btn.dataset.prompt;
    form.requestSubmit();
  });
});

document.addEventListener('keydown', (e) => {
  if (!usuarioAtual) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    ativarAba('view-chat');
    pergunta.focus();
  }
});

document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    pergunta.value = chip.textContent;
    form.requestSubmit();
  });
});

// ==================== HISTÓRICO E CHAT ====================
function registrarConversaNaSidebar(id, titulo) {
  if (!titulo || historicoSidebar.some((item) => item.id === id)) return;
  historicoSidebar.unshift({ id, titulo });
  localStorage.setItem('historico_sidebar', JSON.stringify(historicoSidebar));
  renderizarSidebar();
}

function renderizarSidebar() {
  if (!listaConversasEl) return;
  listaConversasEl.innerHTML = '';

  for (const item of historicoSidebar) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'history-item' + (item.id === conversa ? ' active' : '');

    const span = document.createElement('span');
    span.textContent = item.titulo;
    btn.appendChild(span);

    btn.addEventListener('click', () => {
      ativarAba('view-chat');
      if (item.id === conversa) return;
      conversa = item.id;
      localStorage.setItem('conversa', conversa);
      chat.innerHTML = '';
      renderizarSidebar();
      carregarHistorico();
    });

    listaConversasEl.appendChild(btn);
  }
}

function mostrar(classe, texto) {
  const div = document.createElement('div');
  div.className = classe;
  div.textContent = texto;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

async function carregarHistorico() {
  try {
    const resposta = await fetch('/historico/' + conversa);
    if (!resposta.ok) return;
    const mensagens = await resposta.json();

    mensagens.forEach((m, index) => {
      // Oculta a instrução automática de boas-vindas do usuário na exibição visual
      if (index === 0 && m.role === 'user' && m.content.startsWith('Oi! Acabei de fazer login. Meu nome é ')) {
        return;
      }
      mostrar('msg ' + m.role, m.content);
    });

    const primeiraPerguntaReal = mensagens.find(
      (m) => m.role === 'user' && !m.content.startsWith('Oi! Acabei de fazer login.')
    );
    if (primeiraPerguntaReal) {
      registrarConversaNaSidebar(conversa, primeiraPerguntaReal.content);
    }
  } catch (erro) {
    console.warn('Erro ao buscar histórico:', erro);
  }
}

nova?.addEventListener('click', () => {
  ativarAba('view-chat');
  conversa = crypto.randomUUID();
  localStorage.setItem('conversa', conversa);
  chat.innerHTML = '';
  renderizarSidebar();
  pergunta?.focus();
});

form?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const texto = pergunta.value.trim();
  if (!texto) return;

  registrarConversaNaSidebar(conversa, texto);
  mostrar('msg user', texto);
  pergunta.value = '';
  if (enviar) enviar.disabled = true;

  const balao = mostrar('msg assistant', 'Pensando...');

  try {
    const resposta = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversa: conversa, texto: texto })
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Erro no servidor');

    balao.textContent = dados.resposta;

    if (dados.ferramentas && dados.ferramentas.length > 0) {
      const badge = document.createElement('div');
      badge.className = 'ferramentas';
      badge.textContent = 'Consultou: ' + dados.ferramentas.join(', ');
      chat.insertBefore(badge, balao);
    }
  } catch (erro) {
    balao.textContent = 'Erro: ' + erro.message;
  } finally {
    if (enviar) enviar.disabled = false;
    chat.scrollTop = chat.scrollHeight;
    pergunta?.focus();
  }
});

// ==================== INICIALIZAÇÃO ====================
if (usuarioAtual && usuarioAtual.nome) {
  aplicarUsuarioNaTela(usuarioAtual);
  loginScreen.classList.add('hidden');
  appPrincipal.classList.remove('hidden');
  renderizarSidebar();
  carregarHistorico();
} else {
  loginScreen.classList.remove('hidden');
  appPrincipal.classList.add('hidden');
  loginNome?.focus();
}