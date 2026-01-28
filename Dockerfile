FROM node:20-alpine

WORKDIR /app

# Copy web package files explicitly
COPY web/package.json ./package.json

# Install dependencies
RUN npm install

# Copy rest of web source
COPY web/ ./

# Build Next.js
RUN npm run build

# Expose port
EXPOSE 3000

# Start
CMD ["npm", "run", "start"]
