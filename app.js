require('dotenv').config();
const express = require('express');
const pool = require('./db');

const app = express();
app.use(express.json());

const validateBookData = (titulo, autor, anio_publicacion) => {
  if (typeof titulo !== 'string' || titulo.trim() === '') {
    return false;
  }
  if (typeof autor !== 'string' || autor.trim() === '') {
    return false;
  }
  if (
    anio_publicacion === undefined ||
    anio_publicacion === null ||
    !Number.isInteger(Number(anio_publicacion)) ||
    String(anio_publicacion).trim() === ''
  ) {
    return false;
  }
  return true;
};

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'active', version: '1.0.0', message: 'Servicio activo' });
});

app.get('/libros', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, titulo, autor, anio_publicacion FROM libros');
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar libros' });
  }
});

app.get('/libros/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT id, titulo, autor, anio_publicacion FROM libros WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }
    res.status(200).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar el libro' });
  }
});

app.post('/libros', async (req, res) => {
  const { titulo, autor, anio_publicacion } = req.body;

  if (!validateBookData(titulo, autor, anio_publicacion)) {
    return res.status(400).json({ error: 'Datos invalidos' });
  }

  const parsedAnio = parseInt(anio_publicacion, 10);
  const cleanTitulo = titulo.trim();
  const cleanAutor = autor.trim();

  try {
    const [result] = await pool.query(
      'INSERT INTO libros (titulo, autor, anio_publicacion) VALUES (?, ?, ?)',
      [cleanTitulo, cleanAutor, parsedAnio]
    );

    const [rows] = await pool.query(
      'SELECT id, titulo, autor, anio_publicacion FROM libros WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar el libro' });
  }
});

app.put('/libros/:id', async (req, res) => {
  const { id } = req.params;
  const { titulo, autor, anio_publicacion } = req.body;

  if (!validateBookData(titulo, autor, anio_publicacion)) {
    return res.status(400).json({ error: 'Datos invalidos' });
  }

  const parsedAnio = parseInt(anio_publicacion, 10);
  const cleanTitulo = titulo.trim();
  const cleanAutor = autor.trim();

  try {
    const [check] = await pool.query('SELECT id FROM libros WHERE id = ?', [id]);
    if (check.length === 0) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }

    await pool.query(
      'UPDATE libros SET titulo = ?, autor = ?, anio_publicacion = ? WHERE id = ?',
      [cleanTitulo, cleanAutor, parsedAnio, id]
    );

    const [updated] = await pool.query(
      'SELECT id, titulo, autor, anio_publicacion FROM libros WHERE id = ?',
      [id]
    );

    res.status(200).json(updated[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el libro' });
  }
});

app.delete('/libros/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query('DELETE FROM libros WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }

    res.status(200).json({ message: 'Libro eliminado exitosamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar el libro' });
  }
});

module.exports = app;
