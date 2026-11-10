# Production Lightweight Container for Sepsis CDS Dashboard
FROM nginx:alpine

# Copy web application and curated datasets to nginx html directory
COPY app /usr/share/nginx/html

# Expose HTTP port 80
EXPOSE 80

# Healthcheck to verify service responsiveness
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
