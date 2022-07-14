import axios from 'axios';
import fs from 'fs';
import cheerio from 'cheerio';
import converter from '@tryghost/html-to-mobiledoc';
import imageSize from 'image-size';
import path from 'path';
import 'dotenv/config';

// Import local dependencies
import ghostObj from './src/ghostObj.js';
import ghostAuthor from './src/ghostAuthor.js';
// Date ranges used when adding tags to posts
import {
  autumn2018Start,
  autumn2018End,
  spring2019Start,
  spring2019End,
  autumn2019Start,
  autumn2019End,
  autumn2021Start,
  autumn2021End,
  spring2022Start,
  spring2022End
} from './src/dateRanges.js';

// Used when creating/assigning Ghost post IDs
import {postIndex, nextAvailableId} from './src/postID.js';

// Get environment variables
const imageDir = process.env.IMAGE_DIR;
const baseUrl = process.env.POST_URL;



// You can comment out getPosts() once you've run the script once.
getPosts(baseUrl);
migratePosts();



function migratePosts() {
  const rawStatamicPosts = readPostFile().data;
  
  const ghostPosts = rawStatamicPosts.map(post => {
      return convertPost(post, newPost());
  });
  
  ghostPosts.forEach(post => {
    ghostObj.data.posts.push(post);
  });
  
  ghostObj.data.users.push(ghostAuthor);
  
  let ghostObjOutput = JSON.stringify(ghostObj);
  fs.writeFileSync('output.json', ghostObjOutput);
}


function convertPost(post, output) {
  // Prevent duplicate posts being exported
  if (ghostObj.data.posts.some(p => p.slug === post.slug)) {
    throw new Error(`Slug "${post.slug}" already present in output array`)
  }
  
  const postDate = new Date(post.date)
  
  output.id = nextAvailableId(postIndex)
  postIndex.push({id: output.id, slug: post.slug})
  output.title = post.title
  output.slug = post.slug
  output.published_at = toUnixTimestamp(postDate)
  output.created_at = toUnixTimestamp(postDate)
  output.updated_at = toUnixTimestamp(new Date(post.updated_at))
  output.custom_excerpt = post.description.slice(0, 300);
  output.feature_image = `__GHOST_URL__/content/images${post.lead_image.url}`
  
  // Add "Tour" tag
  if (postDate > autumn2018Start && postDate < autumn2018End) {
    let tagId = addTag("autumn2018", "Autumn 2018")
    ghostObj.data.posts_tags.push({tag_id: tagId, post_id: output.id})
  }
  
  if (postDate > spring2019Start && postDate < spring2019End) {
    let tagId = addTag("spring2019", "Spring 2019")
    ghostObj.data.posts_tags.push({tag_id: tagId, post_id: output.id})
  }
  
  if (postDate > autumn2019Start && postDate < autumn2019End) {
    let tagId = addTag("autumn2019", "Autumn 2019")
    ghostObj.data.posts_tags.push({tag_id: tagId, post_id: output.id})
  }
  
  if (postDate > autumn2021Start && postDate < autumn2021End) {
    let tagId = addTag("autumn2021", "Autumn 2021")
    ghostObj.data.posts_tags.push({tag_id: tagId, post_id: output.id})
  }
  
  if (postDate > spring2022Start && postDate < spring2022End) {
    let tagId = addTag("spring2022", "Spring 2022")
    ghostObj.data.posts_tags.push({tag_id: tagId, post_id: output.id})
  }

  // Add "Country" tag
  if (post.country.length > 0) {
    let tagId = addTag(post.country[0].slug, post.country[0].title)
    ghostObj.data.posts_tags.push({tag_id: tagId, post_id: output.id})
  }
  
  // Add location data
  if (post.lng && post.lat) {
    output.codeinjection_head = `<script>window.lng=${post.lng};window.lat=${post.lat};</script>`
  }
  
  // Use cheerio to create an in-memory DOM that the post will be built into
  let $ = cheerio.load("<main></main>");
  let main = $('main')
  
  // Create a list of Ghost blocks from Bard's content_area
  const blocks = post.content_area.map(block => {
    // renderBlock() is a switch statement that determines which function should render the block based on type.
    return renderBlock(block);
  })
  
  blocks.forEach(b => {
    main.append(b)
  })
  
  // Create an HTML representation of the post
  let html = main.html();
  
  // Convert to mobiledoc
  let mobileDoc = converter.toMobiledoc(html)
  
  // Save to the post
  output.mobiledoc = JSON.stringify(mobileDoc);
  
  return output;
}

function renderBlock(block) {
  switch (block.type) {
    case "text":
      return block.text;
      break;
    case "three_images":
      return makeImageGallery(block.images);
      break;
    case "image_with_caption":
      if (!block.image) {
        break;
      }
      return makeImageCard(block.image.url, block.caption || "");
      break;
    case "video":
      return makeVideoCard(block.video_url);
      break;
    default:
      throw new Error(`No case matching type ${block.type} in post ${post.title} from date ${post.date}`)
  }
}

function addTag(slug, title) {
  if (ghostObj.data.tags.some(t => t.slug === slug)) {
    return getTagId(slug)
  }
  let tagId = nextAvailableId(ghostObj.data.tags)
  ghostObj.data.tags.push({
    id: tagId,
    slug: slug,
    name: title
  })
  return tagId;
}

function getTagId(slug) {
  return ghostObj.data.tags.find(t => t.slug === slug).id
}

function makeVideoCard(url) {
  return `<figure class="kg-card kg-embed-card"><iframe width="200" height="113" src="${url}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></figure>`
}

function makeLocationCard(lng, lat) {
  return `<!--kg-card-begin: html--><div id='map' style='width: 800px; height: 600px;'></div>\n<script>\nwindow.lat = ${lat};\nwindow.lng = ${lng};\n</script><!--kg-card-end: html-->`
}



function makeImageGallery(images) {
  let fig = cheerio.load('<figure class="kg-card kg-gallery-card kg-width-wide"><div class="kg-gallery-container"><div class="kg-gallery-row"></div></div></figure>')
  let gallery = fig('.kg-gallery-row');
  
  images.forEach(image => {
    const d = getImageData(image)
    gallery.append(`<div class="kg-gallery-image"><img src="${d.url}" width="${d.width}" height="${d.height}"></div>`)
  })
  
  return fig('body').html();
}

function makeImageCard(path, caption) {
  return `<figure class="kg-card kg-image-card kg-width-wide"><img src="__GHOST_URL__/content/images${path}"><figcaption>${caption}</figcaption></figure>`;
}

function getImageData(image) {
  const imagePath = path.join(imageDir, image.url);
  const dimensions = imageSize(imagePath);
  
  // Create an image URL that can be referenced from within Ghost
  const url = path.join("__GHOST_URL__/content/images", image.url);
  
  // if orientation is not "normal", switch the height and width values
  if (dimensions.orientation == 1 || dimensions.orientation == 3 || !dimensions.orientation) {
    return {
      url: url,
      height: dimensions.height,
      width: dimensions.width
    }
  } else {
    return {
      url: url,
      height: dimensions.width,
      width: dimensions.height
    }
  } 
}



function toUnixTimestamp(date) {
  return date.getTime()
}



function readPostFile() {
  let rawdata = fs.readFileSync('posts.json');
  return JSON.parse(rawdata);
}



// Retrieves data from Statamic API as JSON and saves to a local file called "posts.json"
function getPosts(url) {
  axios
  .get(url)
  .then(res => {
    let data = JSON.stringify(res.data);
    fs.writeFileSync('posts.json', data);
  })
  .catch(error => {
    console.error(error);
  });
}



/** Scaffolds out a new, empty Ghost post */
function newPost() {
  return {
    id: null,
    title: "",
    slug: "",
    mobiledoc: null,
    html: "",
    feature_image: "",
    feature_image_alt: "",
    feature_image_caption: "",
    featured: 0,
    page: 0,
    type: "post",
    status: "published",
    published_at: null,
    published_by: 1,
    meta_title: null,
    meta_description: null,
    email_only: false,
    author_id: 1,
    created_at: null,
    created_by: 1,
    updated_at: null,
    updated_by: 1,
    custom_excerpt: "",
    codeinjection_head: ""
  }
}

