FROM node:20-alpine

WORKDIR /app

# Only copy web folder
COPY web/package*.json ./

# Install dependencies
RUN npm install

# Copy web source
COPY web/ ./

# Build Next.js
RUN npm run build

# Expose port
EXPOSE 3000

# Start
CMD ["npm", "run", "start"]
