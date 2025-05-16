const DATA_DIRECTORY = Deno.env.get("DATA_DIRECTORY") || "./data";

type MoneriumOrder = {
  id: string;
  kind: string;
  profile: string;
  address: string;
  chain: string;
  currency: string;
  amount: string;
  counterpart: {
    identifier: {
      standard: string;
      iban: string;
    };
    details: {
      name: string;
      address?: string;
    };
  };
  memo: string;
  state: string;
  meta: {
    placedAt: string;
    processedAt: string;
    txHashes: string[];
  };
};

async function getAccessToken() {
  const clientId = Deno.env.get("MONERIUM_CLIENT_ID");
  const clientSecret = Deno.env.get("MONERIUM_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error(
      "MONERIUM_CLIENT_ID or MONERIUM_CLIENT_SECRET is not set in the environment"
    );
  }
  const response = await fetch("https://api.monerium.app/auth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const data = await response.json();
  return data.access_token;
}

const accessToken: string = await getAccessToken();
if (!accessToken) {
  throw new Error("monerium:Failed to get access token");
}

export function getLastOrder(): MoneriumOrder | undefined {
  try {
    const data = JSON.parse(
      Deno.readTextFileSync(`${DATA_DIRECTORY}/monerium-orders.json`)
    );
    if (!data.orders || data.orders.length === 0) {
      console.error(
        `monerium: No orders found in ${DATA_DIRECTORY}/monerium-orders.json`
      );
      return undefined;
    }
    return data.orders[0];
  } catch (e) {
    console.error("monerium: Failed to get last order", e);
    return undefined;
  }
}

export async function getOrders(profileId?: string): Promise<MoneriumOrder[]> {
  const params = [
    ["profile_id", profileId || ""],
    ["state", "processed"],
  ];
  const queryParams = new URLSearchParams(params);
  const apiCall = `https://api.monerium.app/orders?${queryParams}`;
  const response = await fetch(apiCall, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.monerium.api-v2+json",
    },
  });
  const data = await response.json();
  Deno.writeTextFileSync(
    `${DATA_DIRECTORY}/monerium-orders.json`,
    JSON.stringify(data, null, 2)
  );
  return data.orders as MoneriumOrder[];
}

export async function getNewOrders(
  profileId?: string
): Promise<MoneriumOrder[]> {
  const lastOrder = getLastOrder();

  const orders = await getOrders(profileId);
  if (!orders) {
    console.error("monerium: couldn't load orders");
    return [];
  }
  const newOrders: MoneriumOrder[] = [];
  for (const order of orders) {
    if (lastOrder && order.id === lastOrder.id) {
      break;
    }
    newOrders.push(order as MoneriumOrder);
  }
  return newOrders;
}

export async function getProfiles() {
  const response = await fetch("https://api.monerium.app/profiles", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.monerium.api-v2+json",
    },
  });
  const data = await response.json();
  console.log(data);
  return data.profiles;
}
