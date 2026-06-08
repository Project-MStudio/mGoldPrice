// OpenAPI 3.1 spec cho các API của mPriceGold (chỉ doc API, không doc web).
export const openapiSpec = {
  openapi: "3.1.0",
  info: {
    title: "mPriceGold API",
    version: "1.0.0",
    description:
      "API giá vàng đa tiệm (multi-store). Dữ liệu cào từ web tiệm vàng, lưu dạng encode, trả JSON đã decode. Mặc định store = `kimphat`.",
  },
  servers: [{ url: "/", description: "Same origin" }],
  tags: [
    { name: "public", description: "API công khai cho mobile/client" },
    { name: "cron", description: "Cào + lưu DB, cần CRON_SECRET" },
  ],
  components: {
    securitySchemes: {
      cronSecret: {
        type: "apiKey",
        in: "header",
        name: "x-cron-secret",
        description: "Bí mật bảo vệ cron. Cũng chấp nhận `Authorization: Bearer <CRON_SECRET>`.",
      },
    },
    parameters: {
      StoreParam: {
        name: "store",
        in: "query",
        required: false,
        description: "Định danh store. Mặc định `kimphat`.",
        schema: { type: "string", default: "kimphat", example: "kimphat" },
      },
    },
    schemas: {
      GoldRow: {
        type: "object",
        properties: {
          name: { type: "string", example: "NHẪN TRÒN 99.99" },
          buy: { type: "string", example: "13,650,000" },
          sell: { type: "string", example: "13,950,000" },
          time: { type: "string", example: "08/06/2026 10:19" },
        },
        required: ["name", "buy", "sell", "time"],
      },
      GoldData: {
        type: "object",
        properties: {
          domestic: { type: "array", items: { $ref: "#/components/schemas/GoldRow" } },
          world: { type: "array", items: { $ref: "#/components/schemas/GoldRow" } },
        },
        required: ["domestic", "world"],
      },
      PriceEntry: {
        type: "object",
        properties: {
          store: { type: "string", example: "kimphat" },
          store_name: { type: "string", example: "Kim Phát" },
          price: {
            type: "object",
            properties: {
              created_at: { type: ["string", "null"], format: "date-time" },
              updated_at: { type: ["string", "null"], format: "date-time" },
              data: { oneOf: [{ $ref: "#/components/schemas/GoldData" }, { type: "null" }] },
            },
            required: ["created_at", "updated_at", "data"],
          },
        },
        required: ["store", "store_name", "price"],
      },
      HistoryItem: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
          data: { $ref: "#/components/schemas/GoldData" },
        },
        required: ["id", "created_at", "updated_at", "data"],
      },
      StoreHistory: {
        type: "object",
        properties: {
          store: { type: "string", example: "kimphat" },
          store_name: { type: "string", example: "Kim Phát" },
          history: { type: "array", items: { $ref: "#/components/schemas/HistoryItem" } },
        },
        required: ["store", "store_name", "history"],
      },
      CronResponse: {
        type: "object",
        description: "Kết quả cào 1 store (khi gọi có ?store=).",
        properties: {
          store_id: { type: "string", example: "kimphat" },
          changed: { type: "boolean", example: true },
          action: { type: "string", enum: ["insert", "update"], example: "insert" },
          data: { $ref: "#/components/schemas/GoldData" },
        },
        required: ["store_id", "changed", "action", "data"],
      },
      CronBatchResponse: {
        type: "object",
        description: "Kết quả cào TẤT CẢ store (khi gọi không có ?store=). Mỗi phần tử là kết quả 1 store, hoặc { store_id, error } / { store_id, skipped } nếu lỗi/chưa đăng ký fetcher.",
        properties: {
          count: { type: "integer", example: 2 },
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                store_id: { type: "string", example: "kimphat" },
                changed: { type: "boolean" },
                action: { type: "string", enum: ["insert", "update"] },
                data: { $ref: "#/components/schemas/GoldData" },
                error: { type: "string" },
                skipped: { type: "string" },
              },
              required: ["store_id"],
            },
          },
        },
        required: ["count", "results"],
      },
      Store: {
        type: "object",
        properties: {
          store_id: { type: "string", example: "kimphat" },
          name: { type: "string", example: "Kim Phát" },
          website: { type: "string", example: "https://kimphat.evosoft.vn/" },
        },
        required: ["store_id", "name", "website"],
      },
      StoresResponse: {
        type: "object",
        properties: {
          count: { type: "integer", example: 1 },
          stores: { type: "array", items: { $ref: "#/components/schemas/Store" } },
        },
        required: ["count", "stores"],
      },
      Error: {
        type: "object",
        properties: { error: { type: "string", example: "Unauthorized" } },
        required: ["error"],
      },
    },
  },
  paths: {
    "/api/stores": {
      get: {
        tags: ["public"],
        summary: "Danh sách store",
        description: "Tất cả store đã đăng ký (từ bảng store).",
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/StoresResponse" } } },
          },
        },
      },
    },
    "/api/price": {
      get: {
        tags: ["public"],
        summary: "Giá hiện tại (mảng theo store)",
        description:
          "Trả MẢNG [{ store, store_name, price }]. Không có `?store=` → tất cả store; có → lọc còn store đó (1 phần tử). price là row mới nhất đã decode.",
        parameters: [{ $ref: "#/components/parameters/StoreParam" }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/PriceEntry" } },
              },
            },
          },
          "404": {
            description: "Unknown store",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/price/{store}": {
      get: {
        tags: ["public"],
        summary: "Giá hiện tại theo store",
        description: "Trả 1 object { store, store_name, price } cho đúng store trong path.",
        parameters: [
          {
            name: "store",
            in: "path",
            required: true,
            schema: { type: "string", example: "kimphat" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PriceEntry" } } },
          },
          "404": {
            description: "Unknown store",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/history": {
      get: {
        tags: ["public"],
        summary: "Lịch sử thay đổi (mảng theo store)",
        description:
          "Trả MẢNG [{ store, store_name, history }]. Không có `?store=` → tất cả store; có → lọc còn store đó. history sort theo thời gian (cũ → mới).",
        parameters: [{ $ref: "#/components/parameters/StoreParam" }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/StoreHistory" } },
              },
            },
          },
          "404": {
            description: "Unknown store",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/history/{store}": {
      get: {
        tags: ["public"],
        summary: "Lịch sử theo store",
        description: "Trả 1 object { store, store_name, history } cho đúng store trong path.",
        parameters: [
          {
            name: "store",
            in: "path",
            required: true,
            schema: { type: "string", example: "kimphat" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/StoreHistory" } } },
          },
          "404": {
            description: "Unknown store",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/cron": {
      get: {
        tags: ["cron"],
        summary: "Cào + lưu DB",
        description:
          "Không có `?store=` → cào TẤT CẢ store trong bảng store (dùng cho 1 cron định kỳ duy nhất). Có `?store=` → cào đúng store đó. Khác lần trước → INSERT; giống → UPDATE row mới nhất. Cần CRON_SECRET.",
        security: [{ cronSecret: [] }],
        parameters: [{ $ref: "#/components/parameters/StoreParam" }],
        responses: {
          "200": {
            description: "OK — batch (không có ?store=) hoặc single (có ?store=)",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/CronBatchResponse" },
                    { $ref: "#/components/schemas/CronResponse" },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Sai/thiếu secret",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Unknown store",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "502": {
            description: "Cào trang nguồn thất bại",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
  },
} as const;
