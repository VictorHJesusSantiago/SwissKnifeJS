# multicloud-cli

Normaliza inventário de VMs de AWS, Azure e GCP. Reutiliza autenticação segura
dos CLIs oficiais (`aws`, `az`, `gcloud`) e nunca manipula chaves. Falhas de um
provedor não impedem o inventário dos demais.
