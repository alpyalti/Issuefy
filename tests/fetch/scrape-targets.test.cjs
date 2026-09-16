const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {dedupeScrapeTargets}=loadTs('lib/scrape-targets.ts',{'./url-normalize':loadTs('lib/url-normalize.ts')});
test('competitor, discovered and social copies fetch once while preserving attribution/options',()=>{
 const targets=[{url:'https://www.example.com/news/?utm_source=qa',competitorId:'competitor'},
 {url:'https://example.com/news#fragment',keywordId:'keyword'},
 {url:'https://example.com/news',scrapeOpts:{render:true,premium:true}},
 {url:'https://example.com/news?edition=2'}];const before=structuredClone(targets);
 const result=dedupeScrapeTargets(targets);assert.equal(result.length,2);assert.equal(result[0].competitorId,'competitor');
 assert.deepEqual(result[0].scrapeOpts,{render:true,premium:true});assert.deepEqual(targets,before);
});
