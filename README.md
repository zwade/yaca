# YACA (Yet Another Calculator App)

## Setup

### Local

Setting up YACA is pretty straightforward.

First, if you don't have them yet, make sure you're on a relatively recent version of `node` and `yarn`.

Then, run the following

```bash
cd problem/server
yarn
yarn build
yarn start
```

And now navigate your browser to `http://localhost:3838/`

### Docker

To run YACA under docker, run the following commands

```bash
cd problem/server
docker build . -name yaca
docker run -p 3838:3838 -it yaca
```

Once again, navigate to `http://localhost:3838/`

### Deployment Harness

To run YACA using the production deployment harnesss, run

```bash
cd problem/server
docker-copmose build
cd ../../harness
docker-compose build
docker-compose up -d
```

And then navigate to `http://localhost:1064/`

## Solution

For details on the bug and solution, see `solution/README.md`.
