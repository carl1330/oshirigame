export const devConfig = {
  httpProtocol: "http",
  host: "localhost",
  port: 8080,
  wsProtocol: "ws",
};

export const getWsConfig = () => {
  if (process.env.NODE_ENV === "production") {
    // Use relative URL in production (same host as frontend)
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}/ws`;
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
    // Use relative URL in production (same host as frontend)
    return `${window.location.protocol}//${window.location.host}`;
  } else {
    return (
      devConfig.httpProtocol + "://" + devConfig.host + ":" + devConfig.port
    );
  }
};
