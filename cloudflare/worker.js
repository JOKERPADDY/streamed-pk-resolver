import { Container, getContainer } from "@cloudflare/containers";

export class ResolverContainer extends Container {
  defaultPort = 3000;
  pingEndpoint = "localhost/";
}

export default {
  fetch(request, env) {
    return getContainer(env.RESOLVER, "singleton").fetch(request);
  },
};
