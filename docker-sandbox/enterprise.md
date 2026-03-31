# Cocapn Enterprise Deployment Guide

Production deployment patterns for cocapn in enterprise environments.

## Table of Contents

- [Kubernetes Deployment](#kubernetes-deployment)
- [Horizontal Scaling](#horizontal-scaling)
- [Secret Management](#secret-management)
- [Monitoring](#monitoring)
- [Networking](#networking)
- [Backup and Recovery](#backup-and-recovery)
- [Multi-Tenant Configuration](#multi-tenant-configuration)
- [Security Hardening](#security-hardening)

---

## Kubernetes Deployment

Pre-built manifests are in the `kubernetes/` directory. Deploy with:

```bash
# Create namespace
kubectl apply -f kubernetes/namespace.yaml 2>/dev/null || kubectl create namespace cocapn

# Create secret with API keys
kubectl create secret generic cocapn-secrets \
  --from-literal=DEEPSEEK_API_KEY=sk-your-key \
  --namespace cocapn

# Apply all manifests
kubectl apply -f kubernetes/

# Check status
kubectl get pods -n cocapn
kubectl logs -f deployment/cocapn -n cocapn
```

### Manifests

| File | Purpose |
|------|---------|
| `deployment.yaml` | 2 replicas, rolling updates, resource limits |
| `service.yaml` | ClusterIP on port 3100 |
| `configmap.yaml` | Config and soul.md as ConfigMap |
| `secret.yaml` | Template for API keys |
| `ingress.yaml` | TLS-terminated ingress with nginx |

---

## Horizontal Scaling

Cocapn is stateful per-agent (each agent has its own brain). Scaling strategies:

### Option A: Sticky Sessions

```yaml
# service.yaml — session affinity
apiVersion: v1
kind: Service
metadata:
  name: cocapn
spec:
  selector:
    app: cocapn
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 3600
  ports:
    - port: 3100
```

### Option B: One Pod Per Agent

Each agent gets its own Deployment with a dedicated PVC:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cocapn-agent-alice
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: cocapn
          env:
            - name: COCAPN_NAME
              value: "Alice"
          volumeMounts:
            - name: brain
              mountPath: /app/cocapn
      volumes:
        - name: brain
          persistentVolumeClaim:
            claimName: brain-alice
```

### Option C: External State Store

For large fleets, move brain storage to an external store (Redis, Postgres) instead of the default file-based approach. Requires custom config.

---

## Secret Management

### Kubernetes Secrets (basic)

```bash
kubectl create secret generic cocapn-secrets \
  --from-literal=DEEPSEEK_API_KEY=sk-xxx \
  --namespace cocapn
```

### HashiCorp Vault

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cocapn
spec:
  template:
    spec:
      containers:
        - name: cocapn
          envFrom:
            - secretRef:
                name: cocapn-secrets
      # Use vault-agent or external-secrets operator
      initContainers:
        - name: vault-init
          image: hashicorp/vault:latest
          command: ['vault', 'kv', 'get', '-format=json', 'secret/cocapn']
```

### AWS Secrets Manager

Use the External Secrets Operator:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: cocapn-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets
    kind: ClusterSecretStore
  target:
    name: cocapn-secrets
  data:
    - secretKey: DEEPSEEK_API_KEY
      remoteRef:
        key: cocapn/llm-keys
        property: deepseek
```

---

## Monitoring

### Prometheus Metrics

Cocapn exposes metrics at `/metrics` (port 3100). Key metrics:

- `cocapn_chat_requests_total` — Total chat requests
- `cocapn_chat_duration_seconds` — Request latency histogram
- `cocapn_llm_tokens_total` — Token usage by provider/model
- `cocapn_memory_operations_total` — Memory read/write operations
- `cocapn_health_status` — Health check status

### Prometheus ServiceMonitor

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: cocapn
spec:
  selector:
    matchLabels:
      app: cocapn
  endpoints:
    - port: http
      path: /metrics
      interval: 15s
```

### Grafana Dashboard

Key panels:
- Request rate and latency (p50, p95, p99)
- Token usage by provider (cost tracking)
- Memory store size and growth
- WebSocket connections
- Container health and resource usage

---

## Networking

### Reverse Proxy (nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name agent.example.com;

    ssl_certificate /etc/ssl/certs/agent.example.com.pem;
    ssl_certificate_key /etc/ssl/private/agent.example.com.key;

    location / {
        proxy_pass http://cocapn:3100;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for streaming
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

### TLS with cert-manager

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: cocapn-tls
spec:
  secretName: cocapn-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - agent.example.com
```

---

## Backup and Recovery

### Volume Snapshots

```bash
# Create snapshot
kubectl patch pvc brain-cocapn-0 -p '{"metadata":{"annotations":{"snapshot.storage.kubernetes.io/create-snapshot":"true"}}}'

# Or use VolumeSnapshot
cat <<EOF | kubectl apply -f -
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: brain-backup-$(date +%Y%m%d)
spec:
  source:
    persistentVolumeClaimName: brain-cocapn-0
EOF
```

### Git-Based Backup

Since cocapn uses git for brain storage, you can also back up by pushing to a remote:

```yaml
# In config.yml
sync:
  autoCommit: true
  autoPush: true
  interval: 300
```

Then configure a git remote in the container pointing to a private repository.

---

## Multi-Tenant Configuration

Deploy one instance per tenant with isolated PVCs and configs:

```bash
# Deploy tenant "acme"
helm install cocapn-acme ./chart \
  --set agentName="ACME Assistant" \
  --set brain.pvc.size=10Gi \
  --set secrets.deepseekApiKey=sk-xxx \
  --set ingress.host=acme.agent.example.com

# Deploy tenant "beta"
helm install cocapn-beta ./chart \
  --set agentName="Beta Bot" \
  --set brain.pvc.size=5Gi \
  --set secrets.deepseekApiKey=sk-yyy \
  --set ingress.host=beta.agent.example.com
```

---

## Security Hardening

### Container Security

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
```

### Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: cocapn-egress
spec:
  podSelector:
    matchLabels:
      app: cocapn
  policyTypes:
    - Egress
  egress:
    # Allow DNS
    - to: []
      ports:
        - port: 53
          protocol: UDP
    # Allow LLM API egress
    - to: []
      ports:
        - port: 443
          protocol: TCP
    # Deny all other egress
```

### Resource Limits

```yaml
resources:
  requests:
    cpu: "500m"
    memory: "512Mi"
  limits:
    cpu: "2000m"
    memory: "1Gi"
```
