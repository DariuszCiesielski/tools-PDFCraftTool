module.exports = {
  Canvas: function() {},
  Image: function() {},
  createCanvas: function() { return {}; },
  loadImage: function() { return Promise.resolve({}); }
};
const canvasMock = {
  Canvas: function() {},
  Image: function() {},
  createCanvas: function() { return {}; },
  loadImage: function() { return Promise.resolve({}); }
};

export default canvasMock;
