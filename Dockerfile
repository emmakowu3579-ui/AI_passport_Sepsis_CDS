# ==============================================================================
# Sepsis Clinical Decision Support (CDS) Web Application Container
# Architecture: Privacy-Preserving, Zero-External-Leakage Point-of-Care System
# Serving: Surviving Sepsis Campaign 2021 & Sepsis-3 Guidelines, Deterministic
#          SOFA Calculator, 5-Drug Safety Engine, and Longitudinal Trajectory Viz
# ==============================================================================

# Base image: Official lightweight Nginx on Alpine Linux (< 25 MB)
FROM nginx:alpine

# Install curl for reliable container healthchecks
RUN apk add --no-cache curl

# Deploy custom Nginx server block with ES Module MIME types and Gzip compression
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Deploy the zero-build web application: HTML, CSS, JavaScript modules, and curated data
COPY app /usr/share/nginx/html

# Expose internal HTTP port 80 (mapped to host port 8000 via docker-compose)
EXPOSE 80

# Automated healthcheck ensuring sub-second response from local Nginx worker
HEALTHCHECK --interval=20s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/healthz || exit 1

# Start Nginx in the foreground to keep the container active
CMD ["nginx", "-g", "daemon off;"]
