# k8s-portal

API para solicitar, aprovar e aplicar namespaces com `ResourceQuota`. Aprovação
exige `Authorization: Bearer $ADMIN_TOKEN`. `{"apply":true}` executa `kubectl`
usando o contexto ativo; sem isso retorna o manifesto para GitOps/revisão.
