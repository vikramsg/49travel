import React from 'react';

const SinglePage = () => {
    return (
        <div>
            <h1>Title</h1>
            <div>
                <h2 style={{ textAlign: 'left' }}>Paragraph Title</h2>
                <p style={{ columnCount: 2, columnGap: '1rem' }}>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed convallis lorem nec lacus malesuada aliquam.
                    Curabitur at malesuada velit. Integer iaculis orci ut metus finibus congue. Sed tincidunt lorem vitae risus
                    ullamcorper rutrum. Vivamus bibendum venenatis arcu, et ultricies lacus fermentum ut. Mauris eu volutpat
                    purus. Nullam porttitor, nulla eu iaculis volutpat, libero magna dictum nisl, in eleifend justo neque sed
                    arcu. Donec tincidunt odio eu neque posuere, at egestas nunc scelerisque. Vestibulum pharetra tincidunt
                    fermentum. Suspendisse et rhoncus enim. Sed tempor condimentum facilisis. Curabitur eu mauris efficitur,
                    feugiat neque a, fermentum tortor.
                </p>
            </div>
        </div>
    );
};

export default SinglePage;