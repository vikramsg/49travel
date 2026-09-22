export default function AboutPage() {
  return (
    <main className="mx-auto mt-6 max-w-2xl px-4">
      <div className="space-y-4 text-justify">
        <p>
          Hi I am Vikram. I had the idea of creating this website when some
          friends and I were going to another city from Hamburg and we started
          thinking about how to find all cities we could visit with the new
          Deutschland ticket for 49 Euros.
        </p>
        <p>
          I plan to add new features and cities soon. Keep watching this space!
          In the meantime you can reach me on{" "}
          <a href="https://twitter.com/WhinerVikram" className="text-primary underline">
            Twitter
          </a>{" "}
          or{" "}
          <a
            href="https://www.linkedin.com/in/vikram-singh-phd/"
            className="text-primary underline"
          >
            Linkedin
          </a>
          . I also have a{" "}
          <a href="https://vikramsg.github.io/Blog/" className="text-primary underline">
            blog
          </a>{" "}
          where I write about some of the stuff I am working on, including about{" "}
          <a
            href="https://vikramsg.github.io/blog_49travel/"
            className="text-primary underline"
          >
            how I built this site
          </a>
          .
        </p>
      </div>
    </main>
  );
}
