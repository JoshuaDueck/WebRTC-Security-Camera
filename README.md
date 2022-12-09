# COMP-4300-Final-Project
WebRTC Security Camera

- The security-cam directory contains the React project for the camera itself.
- The cam-viewer contains the React project for the camera viewers.

- A user will require a Firebase account, and a firebase project, in order to obtain the firebaseConfig, which should be pased into src/firebase.js in both directories.
- To run the development version, you will need to download dependencies with `npm install`, then run `./run_dev.sh` in each directory.
- The viewer is on port 3001, and the camera is on port 3000. Each uses HTTPS (spoofed in development mode, which means you will likely get a browser safety warning).
