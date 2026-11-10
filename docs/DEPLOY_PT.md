# Colocar o Retake Gym no ar (VPS grátis da Oracle)

Este guia sobe o servidor do Retake Gym numa VPS gratuita da Oracle Cloud, com endereço próprio,
HTTPS automático e a IA de refeições ligada no Gemini. No fim, cada pessoa abre o link no
celular e adiciona o app à tela de início, sem loja de aplicativos.

Tempo total: uns 40 minutos, quase tudo esperando.

O que você precisa ter à mão:

- um cartão de crédito (a Oracle só usa para verificar a conta; o plano Always Free não cobra);
- acesso ao painel onde está o domínio da Retake (Registro.br, Cloudflare ou outro);
- uma conta Google, para a chave do Gemini.

---

## 1. Criar a conta na Oracle Cloud

1. Entre em <https://www.oracle.com/br/cloud/free/> e clique em **Comece gratuitamente**.
2. Na **Home Region**, escolha **Brazil East (São Paulo)** ou **Brazil Southeast (Vinhedo)**.
   Essa escolha é definitiva, e a VPS grátis só pode ser criada nela.
3. Termine o cadastro com o cartão. Pode levar alguns minutos até a conta ficar ativa.

## 2. Criar a VPS

1. No painel, abra **Compute → Instances → Create instance**.
2. **Name:** `retakegym`.
3. **Image and shape → Edit:**
   - Image: **Canonical Ubuntu 24.04**.
   - Shape: **Ampere → VM.Standard.A1.Flex**, com **2 OCPUs e 12 GB de memória**
     (está dentro do grátis, que vai até 4 OCPUs e 24 GB).
   - Se aparecer "Out of capacity", tente de novo mais tarde ou use o shape
     **VM.Standard.E2.1.Micro** (também grátis; mais fraco, mas aguenta um grupo pequeno).
4. **Networking:** deixe criar uma VCN nova e marque **Assign a public IPv4 address**.
5. **Add SSH keys:** escolha **Generate a key pair for me** e baixe a **chave privada**.
   Guarde bem esse arquivo: é ele que dá acesso à máquina.
6. Clique em **Create** e espere ficar **Running**. Anote o **Public IP address**.

## 3. Liberar as portas 80 e 443 na Oracle

A Oracle tem um firewall no painel além do da máquina. O script cuida do da máquina; este aqui é
manual:

1. Na página da instância, clique na **Subnet** → **Security Lists** → **Default Security List**.
2. **Add Ingress Rules**, duas vezes:
   - Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port Range **80**.
   - Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port Range **443**.

## 4. Apontar o domínio

Escolha o endereço do app, por exemplo `gym.retaketecnologia.com.br`, e crie no DNS do domínio
um registro:

| Tipo | Nome | Valor |
|------|------|-------|
| A    | `gym` | o IP público da VPS |

- **Registro.br:** *Domínios → o domínio → Editar zona → Nova entrada*.
- **Cloudflare:** *DNS → Add record*, e deixe a nuvem **cinza (DNS only)**. Com a nuvem laranja
  o certificado automático não sai.

A propagação costuma levar de 5 a 30 minutos.

## 5. Pegar a chave do Gemini

1. Abra <https://aistudio.google.com/apikey> com a sua conta Google.
2. **Create API key** e copie a chave (começa com `AIza`).

Ela não deve ser colocada em nenhum arquivo do GitHub: o script guarda a chave só no servidor.

## 6. Instalar

Conecte na VPS. No computador, com a chave privada baixada no passo 2:

```bash
chmod 600 ~/Downloads/ssh-key-*.key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@IP_DA_VPS
```

(No Windows, o mesmo comando funciona no PowerShell. Pelo celular, dá para usar o app Termius
importando a chave.)

Já dentro da VPS, cole:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone -b retake-gym https://github.com/victorivodev/RetakeOpenGym.git retakegym
cd retakegym && sudo bash deploy/install.sh
```

O script pergunta duas coisas: o endereço (o do passo 4) e a chave do Gemini (passo 5). Depois
ele instala o Docker, abre o firewall, constrói o app e sobe tudo com HTTPS. A primeira vez leva
de 5 a 10 minutos.

## 7. Primeiro acesso

1. Abra `https://gym.retaketecnologia.com.br` (o seu endereço).
2. Toque em **Criar conta** e crie **a sua** primeiro (nome, @usuário, e-mail e senha): a primeira
   conta vira o administrador.
3. O cadastro é só por convite: gere um código em **Configurações → Painel de administração →
   Convites** e mande junto com o link. A pessoa toca em **Criar conta**, preenche nome, @usuário,
   e-mail, senha e o código. Cada código vale para uma conta. (Para abrir o cadastro a qualquer
   um, troque `INVITE_ONLY=1` por `INVITE_ONLY=0` no `.env` e rode o `install.sh` de novo.)

**Esqueceu a senha?** Quem esqueceu pede um código ao administrador (**Painel de administração →
a pessoa → Redefinir senha**) e digita em **Esqueceu a senha?** na tela de login. Para a conta do
próprio administrador, troque a senha direto no servidor:

```bash
cd ~/retakegym && sudo docker compose -f deploy/docker-compose.yml exec api node set-login.js "seu@email.com"
```

**Já tinha um perfil com chave de acesso (passkey)?** Dê e-mail, @usuário e senha a ele, sem
perder nada:

```bash
cd ~/retakegym && sudo docker compose -f deploy/docker-compose.yml exec api node set-login.js "Seu nome" --email seu@email.com --username seunome
```

O comando pergunta a senha nova duas vezes (não aparece na tela). Depois disso, entre com o e-mail
e a senha. Também dá para fazer pelo app: **Configurações → Conta → Senha** (confirma com a chave
de acesso uma última vez) e depois **E-mail**.

## 8. Instalar no celular (sem loja)

**iPhone:** abra o link no **Safari** → botão **Compartilhar** → **Adicionar à Tela de Início**.

**Android:** abra o link no **Chrome** → menu **⋮** → **Instalar app** (ou **Adicionar à tela
inicial**).

O app abre em tela cheia, com o ícone da Retake, e funciona offline; quando volta a ter internet,
sincroniza com o servidor.

**APK do Android:** a partir da versão com login por e-mail, o app abre direto na tela de login:
é só entrar com o mesmo e-mail e senha do site, sem código de pareamento.

---

## Manutenção

**Atualizar para a versão mais nova do código:**

```bash
cd ~/retakegym && sudo git pull && sudo bash deploy/install.sh
```

**Fazer backup** (contas, senhas, fotos de perfil e todos os dados ficam em `data/`):

```bash
cd ~/retakegym && sudo tar czf ~/retakegym-backup-$(date +%F).tgz data .env
```

Baixe o arquivo para o seu computador de vez em quando:
`scp -i ~/Downloads/ssh-key-*.key ubuntu@IP_DA_VPS:retakegym-backup-*.tgz .`

**Mudar a chave do Gemini ou outra configuração:** edite `~/retakegym/.env`
(`sudo nano ~/retakegym/.env`) e rode o `install.sh` de novo.

**Ver o que está acontecendo:**

```bash
cd ~/retakegym && sudo docker compose -f deploy/docker-compose.yml logs -f --tail 100
```

## Se algo der errado

- **O site não abre:** confira as regras do passo 3 e se o DNS já aponta para o IP certo
  (`ping gym.retaketecnologia.com.br`).
- **Erro de certificado:** quase sempre é DNS ainda propagando, ou Cloudflare com a nuvem laranja.
  Espere alguns minutos e veja os logs do `caddy`.
- **"E-mail, nome de usuário ou senha errados" e a senha está certa:** confira se o `.env` tem
  `EMAIL_LOGIN=1` (o `install.sh` coloca sozinho) e se a conta já tem senha (`set-login.js`).
- **Muitas tentativas:** depois de 5 senhas erradas a conta espera um pouco antes de aceitar de
  novo (1 minuto, dobrando a cada erro). Espere, ou troque a senha com `set-login.js`.
- **A IA de refeições não aparece:** falta `GEMINI_API_KEY` no `.env`, ou a chave está errada
  (os logs do `api` mostram o erro).

## Segurança, em resumo

- O código é público (licença AGPL), mas **os dados não**: ficam só nesta VPS, em `data/`.
- A chave do Gemini e os segredos ficam só no `.env` do servidor, que nunca vai para o GitHub.
- Só cria conta quem recebe um código de convite seu.
- Todo acesso passa por HTTPS. As senhas são guardadas só como hash (scrypt), nunca em texto.
- Senha com no mínimo 10 caracteres; as óbvias ("senha123456"...) são recusadas.
- Senhas erradas pausam a conta e o endereço de quem tenta, cada um com o seu limite: o Caddy
  passa o IP real de cada visitante para a API, então um visitante não trava o login dos outros.
