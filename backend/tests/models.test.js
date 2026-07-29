const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Room = require('../src/models/Room');
const Message = require('../src/models/Message');

// Schema-level assertions only: these never touch a database connection.

describe('User model', () => {
  it('requires name, email and password', () => {
    const errors = new User({}).validateSync().errors;

    expect(errors.name.message).toBe('Name is required');
    expect(errors.email.message).toBe('Email is required');
    expect(errors.password.message).toBe('Password is required');
  });

  it('rejects a malformed email and a short password', () => {
    const errors = new User({
      name: 'Ada',
      email: 'not-an-email',
      password: '123',
    }).validateSync().errors;

    expect(errors.email.message).toBe('Please enter a valid email address');
    expect(errors.password.message).toBe('Password must be at least 6 characters');
  });

  it('rejects a name longer than 50 characters', () => {
    const errors = new User({
      name: 'a'.repeat(51),
      email: 'ada@example.com',
      password: 'password123',
    }).validateSync().errors;

    expect(errors.name.message).toBe('Name cannot exceed 50 characters');
  });

  it('lowercases and trims the email', () => {
    const user = new User({
      name: '  Ada  ',
      email: '  Ada@Example.COM ',
      password: 'password123',
    });

    expect(user.validateSync()).toBeUndefined();
    expect(user.email).toBe('ada@example.com');
    expect(user.name).toBe('Ada');
  });

  it('compares a candidate password against the stored hash', async () => {
    const user = new User({
      name: 'Ada',
      email: 'ada@example.com',
      password: await bcrypt.hash('password123', 10),
    });

    await expect(user.comparePassword('password123')).resolves.toBe(true);
    await expect(user.comparePassword('wrong')).resolves.toBe(false);
  });

  it('omits the password from its JSON form', () => {
    const user = new User({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'password123',
    });

    expect(user.toJSON().password).toBeUndefined();
    expect(user.toJSON().email).toBe('ada@example.com');
  });
});

describe('Room model', () => {
  const owner = new mongoose.Types.ObjectId();

  it('requires a name, room code and owner', () => {
    const errors = new Room({}).validateSync().errors;

    expect(errors.name.message).toBe('Room name is required');
    expect(errors.roomCode).toBeDefined();
    expect(errors.owner).toBeDefined();
  });

  it('uppercases the room code and enforces its 6-character format', () => {
    const room = new Room({ name: 'Room', roomCode: 'abc123', owner });

    expect(room.validateSync()).toBeUndefined();
    expect(room.roomCode).toBe('ABC123');

    const errors = new Room({ name: 'Room', roomCode: 'AB!', owner }).validateSync()
      .errors;
    expect(errors.roomCode.message).toBe(
      'Room code must be 6 alphanumeric characters'
    );
  });

  it('defaults the language to javascript and restricts it to the supported set', () => {
    const room = new Room({ name: 'Room', roomCode: 'ABC123', owner });
    expect(room.language).toBe('javascript');

    const errors = new Room({
      name: 'Room',
      roomCode: 'ABC123',
      owner,
      language: 'cobol',
    }).validateSync().errors;
    expect(errors.language).toBeDefined();
  });

  it('rejects a description longer than 200 characters', () => {
    const errors = new Room({
      name: 'Room',
      roomCode: 'ABC123',
      owner,
      description: 'a'.repeat(201),
    }).validateSync().errors;

    expect(errors.description.message).toBe('Description cannot exceed 200 characters');
  });
});

describe('Message model', () => {
  it('requires a room, sender and content', () => {
    const errors = new Message({}).validateSync().errors;

    expect(errors.room).toBeDefined();
    expect(errors.sender).toBeDefined();
    expect(errors.content.message).toBe('Message content is required');
  });

  it('rejects content longer than 1000 characters', () => {
    const errors = new Message({
      room: new mongoose.Types.ObjectId(),
      sender: new mongoose.Types.ObjectId(),
      content: 'a'.repeat(1001),
    }).validateSync().errors;

    expect(errors.content.message).toBe('Message cannot exceed 1000 characters');
  });

  it('trims valid content', () => {
    const message = new Message({
      room: new mongoose.Types.ObjectId(),
      sender: new mongoose.Types.ObjectId(),
      content: '  hello  ',
    });

    expect(message.validateSync()).toBeUndefined();
    expect(message.content).toBe('hello');
  });
});
