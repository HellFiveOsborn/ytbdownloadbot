# Use an official Node.js runtime as a parent image
FROM node:22

# Set the working directory in the container
WORKDIR /usr/src/app

# Install software-properties-common to add repositories
RUN apt-get update && \
    apt-get install -y software-properties-common

# Update package lists again after adding repository
RUN apt-get update

# Install bash and other necessary packages
RUN apt-get install -y python3 && \
    apt-get install -y python3-pip && \
    apt-get install -y screen && \
    apt-get install -y bash && \
    apt-get install -y ffmpeg && \
    apt-get install -y jq && \
    apt-get install -y curl && \
    apt-get install -y wget && \
    apt-get install -y redis-server \
    apt-get install -y nano && \
    apt-get install -y crontab

# Install yt-dlp using curl
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Define environment variable
ENV NODE_ENV=production

# Copy the current directory contents into the container at /usr/src/app
COPY . .

# Install any needed packages specified in package.json
RUN npm install

# Make port available to the world outside this container
EXPOSE 3002

# Start Redis server and then your application
ENTRYPOINT ["sh", "-c", "service redis-server start && node --trace-deprecation app.js"]

