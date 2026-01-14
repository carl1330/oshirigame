export const devConfig = {
  httpProtocol: "http",
  host: "localhost",
  port: 8080,
  wsProtocol: "ws",
};

export const prodConfig = {
  httpProtocol: "http",
  host: import.meta.env.VITE_BACKEND_URL || "localhost",
  port: 8080,
  wsProtocol: "ws",
};

export const getWsConfig = () => {
  if (process.env.NODE_ENV === "production") {
    return (
      prodConfig.wsProtocol +
      "://" +
      prodConfig.host +
      ":" +
      prodConfig.port +
      "/ws"
    );
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
    return (
      prodConfig.httpProtocol + "://" + prodConfig.host + ":" + prodConfig.port
    );
  } else {
    return (
      devConfig.httpProtocol + "://" + devConfig.host + ":" + devConfig.port
    );
  }
};
