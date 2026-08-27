import { describe, expect, test } from "vitest";
import { buildZeusxWorkerListing, defaultZeusxServer, parseZeusxTags } from "@/lib/zeusx";

describe("ZeusX listing mapping", () => {
  test("maps stock account fields into worker listing format", () => {
    const listing = buildZeusxWorkerListing(
      {
        id: "stock-1",
        game_name: "Mobile Legends",
        account_title: "collector Natalia EPIC",
        secret_code: "ML# 1632",
        selling_price: 15,
        zeusx_category: "Accounts",
        zeusx_game: null,
        zeusx_server: null,
        zeusx_delivery_method: "Coordinated",
        zeusx_delivery_days: 0,
        zeusx_delivery_hours: 1,
        zeusx_description: "Custom description",
        zeusx_tags: ["epic", "max emblem"]
      },
      ["https://signed.example/image-1.jpg"]
    );

    expect(listing).toMatchObject({
      id: "stock-1",
      stockAccountId: "stock-1",
      enabled: true,
      category: "Accounts",
      game: "Mobile Legends",
      title: "ML# 1632 collector Natalia EPIC",
      price: 15,
      server: "Global (MOONTON)",
      deliveryMethod: "Coordinated",
      deliveryDays: 0,
      deliveryHours: 1,
      description: "Custom description",
      tags: ["epic", "max emblem"],
      imageUrls: ["https://signed.example/image-1.jpg"]
    });
  });

  test("normalizes tags and default server values", () => {
    expect(defaultZeusxServer("Mobile Legends")).toBe("Global (MOONTON)");
    expect(defaultZeusxServer("RSL")).toBe("Global");
    expect(parseZeusxTags(" epic, epic, max emblem ,, ")).toEqual(["epic", "max emblem"]);
  });
});
