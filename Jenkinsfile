
pipeline {
    agent any

    environment {
        IMAGE_NAME = 'srividya14/allergyguard-backend'
        CONTAINER_NAME = 'allergyguard-backend-ci'
        DOCKER = 'C:\\Users\\Srivi\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                echo 'Source code checked out successfully.'
            }
        }

        stage('Build') {
            steps {
                dir('legacy/backend') {
                    bat 'npm install'
                }
            }
        }

        stage('Test/Validate') {
            steps {
                bat 'npm install --no-save jest'
                bat 'npx jest testcases/allergenMatcher.test.js --runInBand'
            }
        }

        stage('Docker Build') {
            steps {
                bat '"%DOCKER%" build -f legacy/backend/Dockerfile -t %IMAGE_NAME%:%BUILD_NUMBER% -t %IMAGE_NAME%:latest .'
            }
        }

        stage('Push to Docker Hub') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-credentials',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_TOKEN'
                )]) {
                    bat 'powershell -NoProfile -Command "$env:DOCKER_TOKEN | & $env:DOCKER login -u $env:DOCKER_USER --password-stdin"'
                    bat '"%DOCKER%" push %IMAGE_NAME%:%BUILD_NUMBER%'
                    bat '"%DOCKER%" push %IMAGE_NAME%:latest'
                }
            }
        }

        stage('Deploy') {
            steps {
                bat '("%DOCKER%" rm -f %CONTAINER_NAME%) 2>nul'
                bat '"%DOCKER%" run -d --name %CONTAINER_NAME% -p 4000:4000 %IMAGE_NAME%:%BUILD_NUMBER%'
            }
        }

        
        
        stage('Verify Deployment') {
            steps {
                sleep time: 5, unit: 'SECONDS'
                bat 'curl.exe --fail --silent --show-error http://localhost:4000/health'
                bat '"%DOCKER%" ps'
            }
        }


    }
}

