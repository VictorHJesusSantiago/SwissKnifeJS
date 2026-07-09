# Example Pets API

Versão: `1.0.0`

## Servidores

- `http://localhost:4010`

## Endpoints

### GET `/pets`

Lista animais

Respostas:

- **200** — Lista

### POST `/pets`



Respostas:

- **201** — Criado

## Modelos

### Pet



```json
{
  "type": "object",
  "required": [
    "id",
    "name"
  ],
  "properties": {
    "id": {
      "type": "integer"
    },
    "name": {
      "type": "string"
    }
  }
}
```

