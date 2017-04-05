stack:
  name: <%= data.name %>
  region: <%= data.region %>
  env: <%= data.env %>
  vpc_cidr: <%= data.vpc_cidr %>

  subnets:
  <% for ( var key in data.subnets ) { %>
    <%= key %>: <%= data.subnets[key] %> <% } %>
