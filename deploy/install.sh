#!/usr/bin/env bash
# Retake Gym: instala ou atualiza o servidor numa VPS Ubuntu (testado para Oracle Cloud Always Free).
#
#   git clone -b retake-gym https://github.com/victorivodev/RetakeOpenGym.git retakegym
#   cd retakegym && sudo bash deploy/install.sh
#
# Rodar de novo atualiza: puxa o código novo e reconstrói, sem perder dados nem o .env.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo: sudo bash deploy/install.sh"; exit 1; }

say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  say "Instalando o Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || { echo "docker compose não encontrado"; exit 1; }

# 2. Firewall do sistema. As imagens Ubuntu da Oracle bloqueiam tudo menos a porta 22 no iptables,
#    então abrimos 80 e 443 (a "Security List" da VCN no painel da Oracle também precisa delas).
if command -v iptables >/dev/null 2>&1; then
  say "Abrindo as portas 80 e 443 no firewall"
  for p in 80 443; do
    iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p tcp --dport "$p" -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport "$p" -j ACCEPT
  done
  iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT -p udp --dport 443 -j ACCEPT
  if command -v netfilter-persistent >/dev/null 2>&1; then
    netfilter-persistent save >/dev/null 2>&1 || true
  else
    DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent >/dev/null 2>&1 && netfilter-persistent save >/dev/null 2>&1 || true
  fi
fi
command -v ufw >/dev/null 2>&1 && ufw status | grep -q active && { ufw allow 80/tcp; ufw allow 443; } || true

# 3. Configuração (.env), só na primeira vez
if [ ! -f .env ]; then
  say "Configuração"
  read -rp "Endereço do app (ex.: gym.retaketecnologia.com.br): " DOMAIN
  DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
  [ -n "$DOMAIN" ] || { echo "Precisa de um endereço."; exit 1; }
  read -rp "Chave da API do Gemini (aistudio.google.com/apikey, Enter para deixar sem IA): " GEMINI
  cat > .env <<ENV
# Gerado por deploy/install.sh em $(date -u +%F). Para mudar algo: edite e rode o install.sh de novo.
DOMAIN=$DOMAIN
RP_ID=$DOMAIN
ORIGIN=https://$DOMAIN
RP_NAME=Retake Gym
DEFAULT_LANG=pt-BR

# O primeiro perfil criado vira admin. Depois disso só entra quem tiver convite
# (gere os códigos em Configurações -> Painel de administração).
FIRST_USER_ADMIN=1
INVITE_ONLY=1
ALLOW_GUEST=0

# IA das refeições
GEMINI_API_KEY=$GEMINI
MEAL_AI_DAILY_CAP=40
ENV
  chmod 600 .env
else
  say "Mantendo o .env que já existe"
  grep -q '^DOMAIN=' .env || { echo "O .env não tem DOMAIN=. Adicione DOMAIN=seu.dominio e rode de novo."; exit 1; }
fi
mkdir -p data
DOMAIN="$(grep '^DOMAIN=' .env | cut -d= -f2-)"

# 4. Código novo (quando veio do git)
if [ -d .git ]; then
  say "Atualizando o código"
  git pull --ff-only || echo "(não deu para atualizar pelo git; seguindo com o código atual)"
fi

# 5. Build e subida
say "Construindo e subindo (a primeira vez leva uns 5 a 10 minutos)"
docker compose -f deploy/docker-compose.yml up -d --build --remove-orphans

say "Pronto"
echo "Abra https://$DOMAIN (o certificado HTTPS sai em até 1 minuto)."
echo "Crie o seu perfil primeiro: ele vira o admin. Depois gere convites para os outros."
echo "Backup: sudo tar czf retakegym-backup-\$(date +%F).tgz -C $ROOT data .env"
