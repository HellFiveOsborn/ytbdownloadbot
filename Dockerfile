# Use an official Node.js runtime as a parent image
FROM node:16

# Set the working directory in the container
WORKDIR /usr/src/app

# Install ffmpeg, ffprobe, and yt-dlp
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get install -y python3 && \
    apt-get install -y python3-pip && \
    apt-get install -y jq && \
    pip3 install yt-dlp

# Copy the current directory contents into the container at /usr/src/app
COPY . .

# Install any needed packages specified in package.json
RUN npm install

# Make port available to the world outside this container
EXPOSE 3000

# Define environment variable
ENV NODE_ENV=production

# Run app.py when the container launches
# CMD ["node", "app.js"]
CMD ["tail", "-f", "/dev/null"]
