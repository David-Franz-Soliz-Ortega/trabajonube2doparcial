const request = require('supertest');
const app = require('./app');
const pool = require('./db');

jest.mock('./db', () => ({
  query: jest.fn()
}));

describe('Pruebas de la API de Libros', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /health debe responder 200 y status active', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body).toHaveProperty('version');
  });

  test('POST /libros con datos validos debe responder 201 y el libro creado', async () => {
    const nuevoLibro = {
      titulo: 'Rayuela',
      autor: 'Julio Cortazar',
      anio_publicacion: 1963
    };

    pool.query
      .mockResolvedValueOnce([{ insertId: 10 }])
      .mockResolvedValueOnce([[{ id: 10, ...nuevoLibro }]]);

    const res = await request(app)
      .post('/libros')
      .send(nuevoLibro);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ id: 10, ...nuevoLibro });
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  test('POST /libros con titulo vacio debe responder 400', async () => {
    const res = await request(app)
      .post('/libros')
      .send({
        titulo: '   ',
        autor: 'Julio Cortazar',
        anio_publicacion: 1963
      });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('POST /libros con anio_publicacion no valido debe responder 400', async () => {
    const res = await request(app)
      .post('/libros')
      .send({
        titulo: 'Rayuela',
        autor: 'Julio Cortazar',
        anio_publicacion: 'anio-invalido'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('GET /libros/:id inexistente debe responder 404', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const res = await request(app).get('/libros/999');

    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('GET /libros debe devolver la lista de libros', async () => {
    const listaMock = [
      { id: 1, titulo: 'Libro 1', autor: 'Autor 1', anio_publicacion: 2000 }
    ];
    pool.query.mockResolvedValueOnce([listaMock]);

    const res = await request(app).get('/libros');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(listaMock);
  });
});
