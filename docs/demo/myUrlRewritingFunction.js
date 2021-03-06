function urlRewritingHook(url) {
    
    // This is some demo code. Adapt to your needs.

    // Let's intercept every call to image.jpg
    const regexp = /images\/image\.jpg\?timestamp=(.*)$/;
    const execResult = regexp.exec(url);

    if (execResult !== null) {

        // ... and choose the right image!
        var bandwidth = howslow.getBandwidth();

        if (bandwidth > 4000) {
            return 'images/image-XL.jpg?timestamp=' + execResult[1];
        } else if (bandwidth > 1000) {
            return 'images/image-L.jpg?timestamp=' + execResult[1];
        } else if (bandwidth > 200) {
            return 'images/image-M.jpg?timestamp=' + execResult[1];
        } else if (bandwidth > 50) {
            return 'images/image-S.jpg?timestamp=' + execResult[1];
        } else if (bandwidth > 10) {
            return 'images/image-XS.jpg?timestamp=' + execResult[1];
        } else {
            return 'images/image-unknown.jpg?timestamp=' + execResult[1];
        }
    }

    // Return null for urls you don't want to change
    return null;
}