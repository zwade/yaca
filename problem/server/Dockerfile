FROM node:lts

WORKDIR /problem
ADD package.json .
ADD yarn.lock .

RUN yarn

ADD . .
RUN yarn build

CMD ["yarn", "start"]