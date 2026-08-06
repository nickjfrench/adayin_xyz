import { sanityClient } from "sanity:client";
import { defineQuery } from "groq";
import { createImageUrlBuilder, type SanityImageSource } from "@sanity/image-url";

const DESTINATIONS_QUERY = defineQuery(
  `*[_type == "destination" && defined(slug.current)] | order(city asc){
    _id, city, country, countryShort, slug, blurb, heroImage,
    "postCount": count(*[_type == "post" && references(^._id)])
  }`,
);

const POSTS_QUERY = defineQuery(
  `*[_type == "post" && defined(slug.current)] | order(_createdAt desc){
    _id, _createdAt, title, slug, excerpt, mainImage, duration, authorName,
    "stopCount": count(stops[]._ref),
    "stopCosts": stops[]->{ cost, currency->{ name, code, icon { provider, name, svg } } },
    "audiences": audiences[]->{ label, longName, "name": name.current, icon { provider, name, svg } },
    "destination": destination->{ _id, city, countryShort, slug }
  }`,
);

const POST_QUERY = defineQuery(
  `*[_type == "post" && slug.current == $slug][0]{
    _id, _createdAt, title, excerpt, mainImage, body,
    duration, testedOn, testedBy, authorName,
    "audiences": audiences[]->{ label, longName, "name": name.current, icon { provider, name, svg } },
    stops[]->{
      _type,
      stopType->{ label, "name": name.current, icon { provider, name, svg } },
      time, title, description, longDesc, cost, currency->{ name, code, icon { provider, name, svg } }, address,
      callouts[]{ kind->{ "name": name.current, label, accent, labelColor, icon { provider, name, svg } }, body },
      travelType->{ label, "name": name.current, icon { provider, name, svg } },
      duration, image, link
    },
    "destination": destination->{ _id, city, country, countryShort, slug },
    closing,
    recommendations[]->{ _type, title, description, longDesc, image, link, stopType->{ label, "name": name.current, icon { provider, name, svg } } }
  }`,
);

const SLUGS_QUERY = defineQuery(
  `*[_type == "post" && defined(slug.current)]{ "params": { "slug": slug.current } }`,
);

const ARTICLE_SLUGS_QUERY = defineQuery(
  `*[_type == "article" && defined(slug.current)]{ "params": { "slug": slug.current } }`,
);

const ARTICLES_QUERY = defineQuery(
  `*[_type == "article" && defined(slug.current)] | order(_createdAt desc){
    _id, _createdAt, title, slug, excerpt, mainImage,
    "destination": destination->{ _id, city, countryShort, slug },
    "post": post->{ _id, title, slug }
  }`,
);

const ARTICLE_QUERY = defineQuery(
  `*[_type == "article" && slug.current == $slug][0]{
    _id, _createdAt, title, excerpt, mainImage, body,
    "destination": destination->{ _id, city, country, countryShort, slug },
    "post": post->{ _id, title, slug }
  }`,
);

export function getDestinations() {
  return sanityClient.fetch(DESTINATIONS_QUERY);
}

export function getItineraries() {
  return sanityClient.fetch(POSTS_QUERY);
}

export function getItinerary(slug: string) {
  return sanityClient.fetch(POST_QUERY, { slug });
}

export function getItinerarySlugs() {
  return sanityClient.fetch(SLUGS_QUERY);
}

export function getArticleSlugs() {
  return sanityClient.fetch(ARTICLE_SLUGS_QUERY);
}

export function getArticles() {
  return sanityClient.fetch(ARTICLES_QUERY);
}

export function getArticle(slug: string) {
  return sanityClient.fetch(ARTICLE_QUERY, { slug });
}

const builder = createImageUrlBuilder(sanityClient);

export function urlFor(source: SanityImageSource) {
  return builder.image(source);
}
