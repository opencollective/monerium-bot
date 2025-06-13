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

export async function getOrders(profileId?: string): Promise<MoneriumOrder[]> {
  const params = [
    ["profile_id", profileId || ""],
    ["state", "processed"],
  ];
  const queryParams = new URLSearchParams(params);

  const accessToken: string = await getAccessToken();
  if (!accessToken && Deno.env.get("ENV") !== "test") {
    throw new Error("monerium: Failed to get access token");
  }

  const apiCall = `https://api.monerium.app/orders?${queryParams}`;
  const response = await fetch(apiCall, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.monerium.api-v2+json",
    },
  });
  const data = await response.json();
  const orders = data.orders as MoneriumOrder[];
  if (!orders) {
    console.error("monerium: couldn't load orders", data);
    return [];
  }
  return orders;
}

/**
 * Get new orders since a given tx hash in reverse chronological order (newest first)
 * @param sinceTxHash - The tx hash to start from (not included)
 * @param profileId - The profile id to filter by
 * @returns The new orders
 */
export const getNewOrders = async (
  sinceTxHash?: string,
  profileId?: string
): Promise<MoneriumOrder[]> => {
  const orders = await getOrders(profileId);
  if (!orders) {
    console.error("monerium: couldn't load orders");
    return [];
  }
  const newOrders: MoneriumOrder[] = [];
  for (const order of orders) {
    if (sinceTxHash && order.meta.txHashes[0] === sinceTxHash) {
      break;
    }
    newOrders.push(order as MoneriumOrder);
  }
  return newOrders.reverse();
};

export async function getProfiles() {
  const accessToken: string = await getAccessToken();
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

export default {
  getProfiles,
  getOrders,
  getNewOrders,
};
