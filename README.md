
![Hyperledger Sawtooth](images/dg.png)

This is a distributed application to help you trace the provenance and other
contextual information of any asset. It can be used as-is or customized for
different use cases. This distributed application runs on top of Hyperledger
Sawtooth, an enterprise blockchain. To learn more about Hyperledger Sawtooth
please see its
[sawtooth-core repo](https://github.com/hyperledger/sawtooth-core) or its
[published docs](https://sawtooth.hyperledger.org/docs/).

## Contents

- [Components](#components)
- [Usage](#usage)
  - [Start Up](#start-up)
  - [Running Scripts in the Shell](#running-scripts-in-the-shell)
  - [Configuring API Keys and Secrets](#configuring-api-keys-and-secrets)
- [Development](#development)
  - [Restarting Components](#restarting-components)
  - [Manually Building Generated Files](#manually-building-generated-files)
- [Documentation](#documentation)
- [License](#license)

## Components

Running alongside the core components from Hyperledger Sawtooth, dgc-REST-api
includes a number of elements customizing the blockchain and user interaction
with it:

- a **transaction processor** which handles dgc-REST-api transaction logic
- a **server** which provides an HTTP/JSON API for dgc-REST-api actions
- a **ledger sync** which syncs blockchain data to a local database
- a **shell** container with the dependencies to run any commands and scripts


## Usage

This project utilizes [Docker](https://www.docker.com/what-docker) to simplify
dependencies and deployment. After cloning this repo, follow the instructions
specific to your OS to install and run whatever components are required to use
`docker` and `docker-compose` from your command line. This is only dependency
required to run dgc-REST-api components.

### Start Up

Once Docker is installed and you've cloned this repo, navigate to the root
project directory and run:

```bash
docker-compose up
```

This will take awhile the first time it runs, but when complete will be running
all required components in separate containers. Many of the components will be
available through HTTP endpoints, including:

- The dgc REST API will be at **http://localhost:8020**
- RethinkDB's admin panel will be available at **http://localhost:8023**
- Sawtooth's blockchain REST API will be available at **http://localhost:8024**

In bash you can shutdown these components with the key combination: `ctrl-C`.
You can shutdown _and_ remove the containers (destroying their data), with the
command:

```bash
docker-compose down
```

### Running Scripts in the Shell

Running `docker-compose up`, will automatically run all scripts necessary to
use all dgc-REST-api components. However if you want to run any additional
scripts, such as scripts to automatically update sample blockchain data, a shell
container is provided with all necessary dependencies installed. To enter the
shell, simply open a terminal window and run:

```bash
docker exec -it dgc-shell bash
```

Once inside the shell, you might try running the one of the update scripts to
see live updates populate in an example web app. First navigate to the server
directory:

```bash
cd server/
```

If you just want to exit the shell, you can simply run:

```bash
exit
```

### Configuring API Keys and Secrets

While the Server runs out of the box with sensible defaults, there are a number
of secrets and API keys which will not be secure unless set explicitly. While
this is fine for demo purposes, any actual deployment set the following
properties:

- **JWT_SECRET**: can be any random string
- **PRIVATE_KEY**: must be 64 random hexadecimal characters
- **MAPS_API_KEY**: provided by [Google Maps](https://developers.google.com/maps/documentation/javascript/get-api-key)

These properties can be set one of two ways, through an environment variable,
or (preferably) by creating a file named `config.json` file in the `server/`
directory. A file named `config.json.example` is provided which should provide
a template to follow.

## Development

### Restarting Components

The default Docker containers use the `volumes` command to link directly to the
source code on your host machine. As a result any changes you make will
immediately be reflected in dgc-REST-api components without having to rebuild
them. However, typically you _will_ have to restart a component before it can
take advantage of any changes. Rather than restarting every container, you can
restart a single component from separate terminal using the container name. For
example:

```bash
docker restart dgc-server
```

The available container names include:
- dgc-shell
- dgc-processor
- dgc-server
- dgc-rethink
- dgc-validator
- dgc-settings-tp
- blockchain-rest-api

#### Building Protobuf Files

Files in the `protos/` directory are used to generate classes for all of the
other components. If any changes are made in this directory, these classes will
need to be rebuilt for all components. While this can be done manually, the
necessary commands are included in `docker-compose.yaml`, so simply stop all
containers with `ctrl-C` and then `docker-compose up` again.

## Documentation

The latest documentation for dgc-REST-api is available within this
repo in the [docs](docs) subdirectory.

## License

Hyperledger Sawtooth software is licensed under the
[Apache License Version 2.0](LICENSE) software license.

Hyperledger Sawtooth dgc-REST-api documentation in the [docs](docs)
subdirectory is licensed under a Creative Commons Attribution 4.0 International
License.  You may obtain a copy of the license at:
http://creativecommons.org/licenses/by/4.0/.

![Open Source Award Badge](images/dg.jpg)
# dgc-database-TP
# dgc-learning
