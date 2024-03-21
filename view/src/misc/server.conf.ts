export const devConfig = {
  httpProtocol: "http",
  host: "localhost",
  port: 8080,
  wsProtocol: "ws",
};

export const prodConfig = {
  httpProtocol: "https",
  host: "backend.carlgulliksson.dev",
  port: 8080,
  wsProtocol: "wss",
};

export const getWsConfig = () => {
  if (process.env.NODE_ENV === "production") {
    return prodConfig.wsProtocol + "://" + prodConfig.host + "/ws";
  } else {
    return (
      devConfig.wsProtocol +
      "://" +
      devConfig.host +
      ":" +
      devConfig.port +
      "/ws"
    );
  }
};

export const getHttpConfig = () => {
  if (process.env.NODE_ENV === "production") {
    return prodConfig.httpProtocol + "://" + prodConfig.host;
  } else {
    return (
      devConfig.httpProtocol + "://" + devConfig.host + ":" + devConfig.port
    );
  }
};
