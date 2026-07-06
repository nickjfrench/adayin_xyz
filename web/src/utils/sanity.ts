import { sanityClient } from "sanity:client";
import { defineQuery } from "groq";
import { createImageUrlBuilder, type SanityImageSource } from "@sanity/image-url";

const DESTINATIONS_QUERY = defineQuery(
  `*[_type == "destination" && defined(slug.current)] | order(order asc, city asc){
    _id, city, country, countryShort, slug, blurb, order, heroImage,
    "postCount": count(*[_type == "post" && references(^._id)])
  }`,
);

const POSTS_QUERY = defineQuery(
  `*[_type == "post" && defined(slug.current)] | order(publishedAt desc){
    _id, title, slug, publishedAt, excerpt, mainImage, duration,
    "stopCount": count(stops),
    "destination": destination->{ _id, city, countryShort, slug }
  }`,
);

const POST_QUERY = defineQuery(
  `*[_type == "post" && slug.current == $slug][0]{
    _id, title, publishedAt, excerpt, mainImage, body,
    duration, testedOn, testedBy,
    stops[]{ time, title, description, callouts[]{ kind->{ "name": name.current, label, accent, labelColor, icon { provider, name, svg } }, body } },
    "destination": destination->{ _id, city, country, countryShort, slug }
  }`,
);

const SLUGS_QUERY = defineQuery(
  `*[_type == "post" && defined(slug.current)]{ "params": { "slug": slug.current } }`,
);

export function getDestinations() {
  return sanityClient.fetch(DESTINATIONS_QUERY);
}

export function getPosts() {
  return sanityClient.fetch(POSTS_QUERY);
}

export function getPost(slug: string) {
  return sanityClient.fetch(POST_QUERY, { slug });
}

export function getPostSlugs() {
  return sanityClient.fetch(SLUGS_QUERY);
}

const builder = createImageUrlBuilder(sanityClient);

export function urlFor(source: SanityImageSource) {
  return builder.image(source);
}
