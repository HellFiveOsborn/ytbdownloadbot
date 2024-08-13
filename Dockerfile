# Use an official Node.js runtime as a parent image
FROM node:22

# Set the working directory in the container
WORKDIR /usr/src/app

# Install necessary packages and dependencies in a single layer
RUN apt-get update && \
    apt-get install -y \
    software-properties-common \
    python3 \
    python3-pip \
    screen \
    bash \
    ffmpeg \
    jq \
    curl \
    wget \
    redis-server && \
    # Install yt-dlp using curl
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Define environment variable
ENV NODE_ENV=production

# Copy the current directory contents into the container at /usr/src/app
COPY . .

# Install any needed packages specified in package.json
RUN npm install

# Make port available to the world outside this container
EXPOSE 3002

# Create setup.sh script to start Redis and the application
RUN echo '#!/bin/sh\n\
service redis-server start\n\
npm run start' > /usr/src/app/setup.sh && \
    chmod +x /usr/src/app/setup.sh

# Use setup.sh as the entrypoint
ENTRYPOINT ["/usr/src/app/setup.sh"]
