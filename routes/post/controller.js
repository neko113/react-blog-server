const Post = require("../../schemas/post");
const mongoose = require("mongoose");
const Joi = require("joi");
const sanitizeHtml = require("sanitize-html");

const { ObjectId } = mongoose.Types;

const sanitizeOption = {
  allowedTags: ["h1", "h2", "b", "i", "u", "s", "p", "ul", "ol", "li", "blockquote", "a", "img"],
  allowedAttributes: {
    a: ["href", "name", "target"],
    img: ["src"],
    li: ["class"],
  },
  allowedSchemes: ["data", "http"],
};

exports.write = async (req, res, next) => {
  const schema = Joi.object().keys({
    title: Joi.string().required(),
    body: Joi.string().required(),
    tags: Joi.array().items(Joi.string()).required(),
  });
  const result = schema.validate(req.body);
  if (result.error) {
    return res.status(400).json(result.error);
  }
  const { title, body, tags } = req.body;
  try {
    const post = await Post.create({
      title,
      body: sanitizeHtml(body, sanitizeOption),
      tags,
      user: req.app.locals.user,
    });
    return res.json(post);
  } catch (error) {
    console.error(error);
    next(error);
  }
};
exports.list = async (req, res, next) => {
  try {
    const posts = await Post.find({});
    return res.json(posts);
  } catch (error) {
    console.error(error);
    next(error);
  }
};
exports.read = (req, res, next) => {
  return res.json(req.app.locals.post);
};
exports.remove = async (req, res, next) => {
  const { id } = req.params;
  try {
    await Post.remove({ _id: id });
    return res.status(204).json({ success: true });
  } catch (error) {
    console.error(error);
    next(error);
  }
};
exports.update = async (req, res, next) => {
  const { id } = req.params;
  const schema = Joi.object().keys({
    title: Joi.string(),
    body: Joi.string(),
    tags: Joi.array().items(Joi.string()),
  });
  const result = schema.validate(req.body);
  if (result.error) {
    return res.status(400).json(result.error);
  }
  const nextData = { ...req.body };
  if (nextData.body) {
    nextData.body = sanitizeHtml(nextData.body, sanitizeOption);
  }
  try {
    const post = await Post.findOneAndUpdate({ _id: id }, nextData, { new: true });
    if (!post) {
      return res.status(404).json({ error: "Not Found" });
    }
    return res.json(post);
  } catch (error) {
    console.error(error);
    next(error);
  }
};

exports.getPostById = async (req, res, next) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Bad Request" });
  }
  try {
    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ error: "Not Found" });
    }
    req.app.locals.post = post;
    return next();
  } catch (error) {
    console.error(error);
    next(error);
  }
};

exports.removeHtmlAndShorten = (body) => {
  const filtered = sanitizeHtml(body, { allowedTags: [] });
  return filtered.length < 200 ? filtered : `${filtered.slice(0, 200)}...`;
};

exports.list = async (req, res, next) => {
  const page = parseInt(req.query.page || "1", 10);
  if (page < 1) {
    return res.status(400).json({ error: "Not Found" });
  }
  const { tag, username } = req.query;
  const query = {
    ...(username ? { "user.username": username } : {}),
    ...(tag ? { tags: tag } : {}),
  };
  try {
    const posts = await Post.find(query)
      .sort({ _id: -1 })
      .limit(10)
      .skip((page - 1) * 10)
      .lean();
    const postCount = await Post.countDocuments(query);
    return res.set("Last-Page", Math.ceil(postCount / 10)).json(posts.map((post) => ({ ...post, body: this.removeHtmlAndShorten(post.body) })));
  } catch (error) {
    console.error(error);
    next(error);
  }
};

exports.checkOwnPost = (req, res, next) => {
  const { user, post } = req.app.locals;
  if (post.user._id.toString() !== user._id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  return next();
};
