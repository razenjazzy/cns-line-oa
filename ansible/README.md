# CNS LINE OA — Production Ansible Playbooks

This directory contains production-ready Ansible playbooks and roles to provision, configure, deploy, and monitor `cns-line-oa` on target servers (Ubuntu / Debian).

---

## Directory Layout

```text
ansible/
├── ansible.cfg                    # Ansible default settings (pipelining, paths)
├── inventory/
│   ├── production.ini             # Production server hosts
│   └── staging.ini                # Staging server hosts
├── group_vars/
│   ├── all.yml                    # Shared variables across all environments
│   ├── production.yml             # Production-specific config and secret mappings
│   └── staging.yml                # Staging-specific config
├── playbooks/
│   ├── site.yml                   # Complete provisioning + deployment
│   ├── deploy.yml                 # Application-only fast redeployment
│   └── healthcheck.yml            # Remote /healthz and /readyz probes
├── roles/
│   ├── common/                    # OS baseline, user creation, security
│   ├── docker/                    # Docker engine & compose setup
│   ├── cns_line_oa/               # App code sync, .env templating, compose run
│   └── nginx/                     # Reverse proxy for LINE Webhooks & SSL
└── README.md
```

---

## Prerequisites

1. **Ansible**: Install Ansible on your control machine (`pip install ansible`).
2. **SSH Access**: Ensure passwordless SSH key authentication is configured to target server(s).

---

## Step-by-Step Usage

### 1. Update Inventory

Edit `inventory/production.ini` and set your server's IP and SSH user:
```ini
[production]
prod-app-01 ansible_host=203.0.113.10 ansible_user=ubuntu
```

### 2. Configure Secrets (Ansible Vault)

Store sensitive keys safely using Ansible Vault:
```bash
# Encrypt sensitive variables into a vault file or string
ansible-vault encrypt_string 'your-line-channel-secret' --name 'vault_line_channel_secret'
```
Add the encrypted strings into `group_vars/production.yml`.

The `cns_line_oa` role fails before deployment when required runtime values
are missing. Configure vault-backed LINE credentials, Odoo credentials, and
`OPS_API_TOKEN`; configure `WEBHOOK_TEST_TOKEN` and demo session secrets when
those staging-only controls are enabled. Do not rely on fallback token values.

### 3. Full Server Provision & Deployment

Provisions OS packages, Docker, Nginx, deploys the app container, and runs health verification:
```bash
ansible-playbook -i inventory/production.ini playbooks/site.yml --ask-vault-pass
```

### 4. Fast Application Redeployment

For subsequent updates after code changes:
```bash
ansible-playbook -i inventory/production.ini playbooks/deploy.yml
```

### 5. Run Health Verification

Query remote `/healthz` and `/readyz` endpoints:
```bash
ansible-playbook -i inventory/production.ini playbooks/healthcheck.yml
```

---

## Integration with Repository Tools

You can also run pre-deployment checks locally before running Ansible:
```bash
# Verify local TypeScript build & Vitest test suite
npm run runner:health

# Preflight checks for environment variables
npm run preflight:prod
```
